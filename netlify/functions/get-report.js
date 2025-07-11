exports.handler = async (event) => {
    // This is a simple test function.
    // It ignores any input and returns a fixed success message.
    try {
        const testReport = "This is a successful test response from the server. The connection is working.";
        
        return {
            statusCode: 200,
            body: JSON.stringify({ report: testReport })
        };

    } catch (error) {
        // This part will run if the function itself has a syntax error.
        console.error('Error in the test function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An internal server error occurred in the test function.' })
        };
    }
};
