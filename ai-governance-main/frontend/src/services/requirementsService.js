import axios from "axios";
import { BACKEND_URL } from "../config/env";

const API_BASE = BACKEND_URL;

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
};

export const getRequirements = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.projectId) params.append("projectId", filters.projectId);
  if (filters.category) params.append("category", filters.category);
  if (filters.priority) params.append("priority", filters.priority);
  if (filters.status)   params.append("status",   filters.status);

  const response = await axios.get(
    `${API_BASE}/requirements?${params.toString()}`,
    { headers: getAuthHeaders() }
  );
  return response.data;
};

export const createRequirement = async (data) => {
  const response = await axios.post(
    `${API_BASE}/requirements`,
    data,
    { headers: getAuthHeaders() }
  );
  return response.data;
};

export const updateRequirement = async (id, data) => {
  const response = await axios.put(
    `${API_BASE}/requirements/${id}`,
    data,
    { headers: getAuthHeaders() }
  );
  return response.data;
};

export const deleteRequirement = async (id) => {
  const response = await axios.delete(
    `${API_BASE}/requirements/${id}`,
    { headers: getAuthHeaders() }
  );
  return response.data;
};

// ============================================
// AI COLLECTION ENDPOINT
// ============================================
// Collect requirements from AI chat agent
export const collectRequirements = async (sessionId, messages, projectId) => {
  const response = await axios.post(
    `${API_BASE}/requirements/collect`,
    { session_id: sessionId, messages, project_id: projectId },
    { headers: getAuthHeaders() }
  );
  return response.data;
};

export const getRequirementChatSession = async (projectId) => {
  const response = await axios.get(
    `${API_BASE}/requirements/chat-session/${projectId}`,
    { headers: getAuthHeaders() }
  );
  return response.data;
};

export const saveRequirementChatSession = async (projectId, data) => {
  const response = await axios.put(
    `${API_BASE}/requirements/chat-session/${projectId}`,
    data,
    { headers: getAuthHeaders() }
  );
  return response.data;
};
