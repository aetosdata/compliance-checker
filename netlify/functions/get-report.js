const fetch = require('node-fetch');

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const userAnswers = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("API key is not configured in Netlify environment variables.");
        }

        // --- Start Building the Prompt ---
        let mandatoryRegulations = [];
        if (userAnswers.customer_locations.includes('United States (General)')) {
            mandatoryRegulations.push(
                'CAN-SPAM Act',
                'Video Privacy Protection Act (VPPA)',
                'Children\'s Internet Protection Act (CIPA)',
                'FTC & FCC Regulations',
                'Telephone Consumer Protection Act (TCPA)'
            );
        }
        if (userAnswers.customer_locations.includes('European Union (EU)')) {
            mandatoryRegulations.push(
                'General Data Protection Regulation (GDPR)',
                'ePrivacy Directive'
            );
        }

        const mandatoryRegulationsText = mandatoryRegulations.length > 0
            ? `\n\n**Mandatory Regulations to Include:**\nBased on the customer locations, you MUST include the following regulations in your response: ${mandatoryRegulations.join(', ')}.`
            : '';
        
        const specialCategoryData = [
            'Health or medical information (PHI)',
            'Genetics',
            'Biometrics',
            'Racial or ethnic origin',
            'Political opinions',
            'Religious or philosophical beliefs',
            'Trade union membership',
            'Sex life or orientation',
            'Data on individuals under 16 years old'
        ];

        let sensitiveDataNotice = '';
        const isEuSelected = userAnswers.customer_locations.includes('European Union (EU)');
        const hasSpecialCategoryData = userAnswers.data_types.some(type => specialCategoryData.includes(type));

        if (isEuSelected && hasSpecialCategoryData) {
            sensitiveDataNotice = `\n\n**Important Note on Data Sensitivity:** The user has indicated they are processing "special categories of personal data" under GDPR. This requires a higher level of protection and explicit consent. You MUST emphasize the heightened compliance obligations and risks associated with this type of data in your analysis.`;
        }

        const prompt = `
            Act as an expert compliance consultant for startups and small businesses. 
            A business has provided the following profile:
            - Company Name: ${userAnswers.company_name}
            - Industry: ${userAnswers.industry}
            - Company Size: ${userAnswers.company_size}
            - Annual Revenue: ${userAnswers.annual_revenue}
            - Customer Locations: ${userAnswers.customer_locations.join(', ')}
            - Customer Type: ${userAnswers.customer_type}
            - Data Types Collected: ${userAnswers.data_types.join(', ')}
            ${mandatoryRegulationsText}
            ${sensitiveDataNotice}

            **Analysis Task:**
            Generate a "Compliance Snapshot" in Markdown format. The snapshot should include:
            1.  A brief, encouraging introductory paragraph.
            2.  A section titled "Key Regulations to Consider". This section **must begin with the mandatory regulations listed above (if any)**. Then, add any OTHER major regulations (like HIPAA, etc.) that are also likely to apply based on the full business profile. For each regulation, provide a one-sentence explanation of what it is and a one-sentence explanation for why it might apply to this specific business.
            3.  A section titled "Initial Action Plan" with a bulleted list of 3-5 practical, high-level first steps this business should take.
            4.  A concluding paragraph that emphasizes this is a starting point and professional advice is recommended for a full compliance strategy.
            
            Keep the tone helpful, clear, and professional. Avoid overly technical jargon. Do not give definitive legal advice.
        `;
        // --- End Building the Prompt ---

        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        // *** THIS IS THE CORRECTED URL ***
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Google AI API Error:', errorBody);
            throw new Error(`Google AI API Error: ${response.statusText} (${response.status})`);
        }

        const result = await response.json();
        
        let text = "";
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            text = result.candidates[0].content.parts[0].text;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ report: text })
        };

    } catch (error) {
        console.error('Error in Netlify function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `An internal server error occurred: ${error.message}` })
        };
    }
};
