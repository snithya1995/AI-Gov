import { getAgentUrl } from '@/config/env';

/**
 * Helper function to manually check for rate limit errors in a fetch response
 * and dispatch the global event.
 * @param {Response} response - The fetch Response object.
 * @returns {Promise<boolean>} True if status is 429, false otherwise.
 */
const handleFetchErrors = async (response) => {
  const status = response.status;
  
  if (status === 429) {
    // Attempt to read the body for reset time, or fall back to header/default
    const resetTimeSeconds = parseInt(response.headers.get('Retry-After') || '60', 10);
    
    // Dispatch a global event
    window.dispatchEvent(
      new CustomEvent('rateLimitExceeded', {
        detail: { 
          resetTimeSeconds,
          message: 'You have exceeded your request limit.' 
        },
      })
    );
    // Throw an error to stop the calling function
    throw new Error(`HTTP error! status: 429 (Rate Limit Exceeded)`);
  }
  
  if (status === 401) {
      // Handle 401 unauthorized manually (fetch doesn't automatically redirect)
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
      throw new Error(`HTTP error! status: 401 (Unauthorized)`);
  }
  
  // For all other non-OK status codes
  if (!response.ok) {
    // You might want to parse the body here to get a detailed message
    const errorBody = await response.json().catch(() => ({ detail: `Unknown Error ${status}` }));
    throw new Error(`HTTP error! status: ${status}. Detail: ${errorBody.detail || 'N/A'}`);
  }

  return false;
};

class ChatAgentService {
  async startChat(projectId = null) {
    try {
      const response = await fetch(getAgentUrl('/agent/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: null, answer: null, project_id: projectId })
      });

      // 🚨 CRITICAL: Check for errors immediately after the fetch call
      await handleFetchErrors(response); 
      
      return await response.json();
    } catch (error) {
      console.error('Error starting chat:', error);
      throw error;
    }
  }

  async sendMessage(sessionId, answer, projectId = null) {
    try {
      const response = await fetch(getAgentUrl('/agent/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, answer: answer, project_id: projectId })
      });

      // 🚨 CRITICAL: Check for errors immediately after the fetch call
      await handleFetchErrors(response);

      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async getRiskAnalysis(data) {
    try {
      const response = await fetch(getAgentUrl('/agent/risk-matrix/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      // 🚨 CRITICAL: Check for errors immediately after the fetch call
      await handleFetchErrors(response);

      return await response.json();
    } catch (error) {
      console.error('Error getting risk analysis:', error);
      throw error;
    }
  }
}

export default new ChatAgentService();
