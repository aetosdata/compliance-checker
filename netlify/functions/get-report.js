const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

// Function to convert Markdown to basic HTML
function parseMarkdown(text) {
    if (!text) return "";
    return text
        .replace(/^### (.*$)/gim, '<h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; margin-top: 1rem;">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; margin-top: 1.25rem;">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 style="font-size: 1.875rem; font-weight: 700; margin-bottom: 1rem;">$1</h1>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^\* (.*$)/gim, '<li style="list-style-type: disc; margin-left: 2rem;">$1</li>')
        .replace(/(<li>(.|\n)*?<\/li>)/g, '<ul>$1</ul>')
        .replace(/<\/ul>\s?<ul>/g, '')
        .replace(/\n/g, '<br>');
}

// Function to generate the full HTML response page
function createHtmlResponse(reportHtml) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Compliance Snapshot</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style> body { font-family: 'Inter', sans-serif; } </style>
    </head>
    <body class="bg-gray-100">
        <div class="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            <header class="text-center mb-8">
                <h1 class="text-3xl sm:text-4xl font-bold text-gray-900">Your Compliance Snapshot</h1>
                <p class="mt-2 text-lg text-gray-600">Powered by Aetos Data Consulting</p>
            </header>
            <main class="bg-white p-6 sm:p-8 rounded-2xl shadow-lg">
                <div class="prose prose-lg max-w-none text-gray-700">
                    ${reportHtml}
                </div>
            </main>
        </div>
    </body>
    </html>
    `;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const params = new URLSearchParams(event.body);
        const userAnswers = Object.fromEntries(params.entries());
        // Handle checkboxes, which might have multiple values
        userAnswers.customer_locations = params.getAll('customer_locations');
        userAnswers.data_types = params.getAll('data_types');

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) { throw new Error("API key is not configured."); }

        // --- Build the Prompt ---
        let mandatoryRegulations = [];
        if (userAnswers.customer_locations.includes('United States (General)')) {
            mandatoryRegulations.push('CAN-SPAM Act', 'VPPA', 'CIPA', 'FTC & FCC Regulations', 'TCPA');
        }
        if (userAnswers.customer_locations.includes('European Union (EU)')) {
            mandatoryRegulations.push('GDPR', 'ePrivacy Directive');
        }
        const mandatoryRegulationsText = mandatoryRegulations.length > 0 ? `\n\n**Mandatory Regulations:**\nYou MUST include: ${mandatoryRegulations.join(', ')}.` : '';
        
        const specialCategoryData = ['Health or medical information (PHI)', 'Genetics', 'Biometrics', 'Racial or ethnic origin', 'Political opinions', 'Religious or philosophical beliefs', 'Trade union membership', 'Sex life or orientation', 'Data on individuals under 16 years old'];
        let sensitiveDataNotice = '';
        const isEuSelected = userAnswers.customer_locations.includes('European Union (EU)');
        const hasSpecialCategoryData = userAnswers.data_types.some(type => specialCategoryData.includes(type));
        if (isEuSelected && hasSpecialCategoryData) {
            sensitiveDataNotice = `\n\n**Important Note:** The user is processing "special categories of personal data" under GDPR. Emphasize the heightened compliance obligations.`;
        }

        const prompt = `
            Analyze the following business profile and generate a "Compliance Snapshot" in Markdown.
            - Profile: ${JSON.stringify(userAnswers)}
            ${mandatoryRegulationsText}
            ${sensitiveDataNotice}
            
            **Task:**
            Generate a "Compliance Snapshot" in Markdown with:
            1. An intro paragraph.
            2. A "Key Regulations to Consider" section. Start with any mandatory regulations, then add others. For each, explain what it is and why it applies.
            3. An "Initial Action Plan" section with a bulleted list of 3-5 steps.
            4. A concluding paragraph.
        `;
        // --- End Prompt ---
        
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) { throw new Error(`Google AI API Error: ${response.statusText}`); }

        const result = await response.json();
        const reportMarkdown = result?.candidates?.[0]?.content?.parts?.[0]?.text || "No detailed report could be generated for this profile.";
        const reportHtml = parseMarkdown(reportMarkdown);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: createHtmlResponse(reportHtml)
        };

    } catch (error) {
        console.error('Error in function:', error);
        const errorHtml = `<h1>Error</h1><p>Sorry, an error occurred while generating your report.</p><p>Error: ${error.message}</p>`;
        return {
            statusCode: 200, // Return 200 so the user sees a friendly error page, not a browser default error
            headers: { 'Content-Type': 'text/html' },
            body: createHtmlResponse(errorHtml)
        };
    }
};
