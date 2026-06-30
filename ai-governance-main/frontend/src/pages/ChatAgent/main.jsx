import React, { useState, useRef, useEffect } from 'react';
import { Alert } from '@mui/material';
import chatAgentService from '../../services/chatAgentService.js';
import { getProjects } from '../../services/projectService.js';
import { 
  ChatHeader, 
  ChatMessages, 
  ChatInput, 
  RiskAnalysisSection 
} from './components';

const ChatAgent = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState(null);
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const [isAnalyzingRisks, setIsAnalyzingRisks] = useState(false);
  const [showRiskAnalysis, setShowRiskAnalysis] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load Projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await getProjects();
        setProjects(data || []);
        if (data?.[0]?.projectId) {
          setSelectedProjectId(data[0].projectId);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      }
    };
    loadProjects();
  }, []);

  // Initialize chat when projectId changes
  useEffect(() => {
    if (selectedProjectId) {
      resetChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const initializeChat = async () => {
    try {
      setError(null);
      setIsTyping(true);
      
      const response = await chatAgentService.startChat(selectedProjectId);
      
      setSessionId(response.session_id);
      
      // Add initial AI message
      const initialMessage = {
        id: Date.now(),
        text: response.question,
        sender: 'ai',
        timestamp: new Date()
      };
      
      setMessages([initialMessage]);
      setIsTyping(false);
    } catch (error) {
      console.error('Error initializing chat:', error);
      setError('Failed to connect to AI assistant. Please try again.');
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping || isFinished) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const userAnswer = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await chatAgentService.sendMessage(sessionId, userAnswer, selectedProjectId);
      
      if (response.finished) {
        // Chat is finished, show summary
        setIsFinished(true);
        
        const summaryMessage = {
          id: Date.now() + 1,
          text: generateSummaryText(response.summary),
          sender: 'ai',
          timestamp: new Date(),
          isSummary: true
        };
        setMessages(prev => [...prev, summaryMessage]);

        // Automatically trigger risk analysis
        await performRiskAnalysis(response.summary);
      } else {
        // Continue with next question

        const aiMessage = {
          id: Date.now() + 1,
          text: response.question,
          sender: 'ai',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: "Sorry, I encountered an error. Please try again.",
        sender: 'ai',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const performRiskAnalysis = async (summary) => {
    try {
      setIsAnalyzingRisks(true);
      
      // Convert summary object to text format for risk analysis
      const summaryText = Object.entries(summary)
        .map(([questionNum, answer]) => `Question ${questionNum}: ${answer}`)
        .join('\n');

      const riskResponse = await chatAgentService.getRiskAnalysis({
        summary: summaryText
      });

      setRiskAnalysis(riskResponse.markdown_table);
      setShowRiskAnalysis(true);

      // Add risk analysis message
      const riskMessage = {
        id: Date.now() + 2,
        text: "🔍 **Risk Analysis Complete**\n\nI've analyzed your responses and identified potential risks. Scroll down to view the detailed risk matrix.",
        sender: 'ai',
        timestamp: new Date(),
        isRiskAnalysis: true
      };
      setMessages(prev => [...prev, riskMessage]);

    } catch (error) {
      console.error('Error performing risk analysis:', error);
      const errorMessage = {
        id: Date.now() + 2,
        text: "⚠️ Risk analysis failed. Please try again later.",
        sender: 'ai',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAnalyzingRisks(false);
    }
  };

  const generateSummaryText = (summary) => {
    if (!summary) return "Thank you for completing the questionnaire!";
    
    const questionLabels = [
      "Name and Country",
      "Project Type",
      "Data Regions",
      "AI System Purpose",
      "General Purpose AI",
      "Learning Model",
      "Regulations Review",
      "Human Oversight",
      "Affected Groups",
      "Project Timeline",
      "Timeline Factors"
    ];

    let summaryText = "📋 **Questionnaire Summary**\n\n";
    
    Object.entries(summary).forEach(([questionNum, answer]) => {
      const questionIndex = parseInt(questionNum) - 1;
      if (questionLabels[questionIndex]) {
        summaryText += `**${questionLabels[questionIndex]}:** ${answer}\n\n`;
      }
    });
    
    summaryText += "Your responses have been recorded. Risk analysis is being performed...";
    
    return summaryText;
  };

  const parseMarkdownTable = (markdownTable) => {
    if (!markdownTable) return [];
    
    // Remove the [RiskMatrixAgent] prefix if present
    const cleanTable = markdownTable.replace(/\[RiskMatrixAgent\]/g, '').trim();
    
    // Split into lines and filter out empty lines
    const lines = cleanTable.split('\n').filter(line => line.trim());
    
    // Find the table rows (lines that start with |)
    const tableRows = lines.filter(line => line.startsWith('|'));
    
    // Parse each row
    return tableRows.map(row => {
      const cells = row.split('|').filter(cell => cell.trim());
      return cells.map(cell => cell.trim());
    });
  };

  const resetChat = () => {
    setMessages([]);
    setInputValue('');
    setSessionId(null);
    setIsFinished(false);
    setError(null);
    setRiskAnalysis(null);
    setShowRiskAnalysis(false);
    setIsAnalyzingRisks(false);
    initializeChat();
  };

  const parsedRiskTable = parseMarkdownTable(riskAnalysis);

  return (
    <div className="flex flex-col h-full bg-gray-100 p-3">
      {/* Header */}
      <ChatHeader 
        isFinished={isFinished}
        isTyping={isTyping}
        onResetChat={resetChat}
      />

      {/* Project Selector */}
      <div className="bg-white border rounded-xl p-3 mb-3 shadow-sm flex items-center space-x-3">
        <label className="text-xs font-semibold text-gray-500">Project Context:</label>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="text-xs rounded-lg border-gray-200 bg-white px-2.5 py-1.5 focus:border-indigo-500 focus:ring-indigo-500"
        >
          {projects.length === 0 ? (
            <option value="">No projects available</option>
          ) : (
            <>
              <option value="" disabled>Select a project…</option>
              {projects.map(project => (
                <option key={project.projectId} value={project.projectId}>
                  {project.projectName} ({project.projectId})
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" className="mb-3 text-sm" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Risk Analysis Section */}
      <RiskAnalysisSection 
        showRiskAnalysis={showRiskAnalysis}
        riskAnalysis={riskAnalysis}
        parsedRiskTable={parsedRiskTable}
        onHideAnalysis={() => setShowRiskAnalysis(false)}
      />

      {/* Messages Container */}
      <ChatMessages 
        messages={messages}
        isTyping={isTyping}
        isAnalyzingRisks={isAnalyzingRisks}
        messagesEndRef={messagesEndRef}
      />

      {/* Input Container */}
      <ChatInput 
        inputValue={inputValue}
        setInputValue={setInputValue}
        onSendMessage={handleSendMessage}
        isTyping={isTyping}
        isFinished={isFinished}
        inputRef={inputRef}
      />
    </div>
  );
};

export default ChatAgent;