// File: Questionnaire.jsx
import { useState, useEffect } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import EditIcon from "@mui/icons-material/Edit"; // Added for edit functionality
import {
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  Select,
  InputLabel,
  Box,
  CircularProgress,
  Alert,
  Tooltip,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  FormHelperText,
  Container,
  Paper,
  Typography,
  Divider,
} from "@mui/material";
// QuestionItem is no longer needed as rendering logic is moved into this component
import OptionEditor from "./optionEditor";
import { nanoid } from "nanoid";
import questionnaireService from "../../services/questionnaireService";
import templateService from "../../services/templateService";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { DEFAULT_PROJECT_ID } from "../../constants/projectDefaults";

// --- General Questions remain the same ---
const GENERAL_QUESTIONS = [
  {
    id: "requestOwner",
    label:
      "1. Please enter your name or the name of the person for whom you are submitting this request and the country in which the request owner is located?",
    type: "text",
    required: true,
    placeholder: "Name, country...",
  },
  {
    id: "projectType",
    label:
      "2. Is this project internal to our organization or does it involve any third parties?",
    type: "radio",
    required: true,
    options: [
      { value: "internal", label: "Developing a product in-house" },
      {
        value: "thirdparty",
        label: "Adopting/integrating third party AI system",
      },
    ],
  },
  {
    id: "projectName",
    label: "3. What is the name of your project?",
    type: "text",
    required: true,
    placeholder: "Enter project name...",
  },
  {
    id: "region",
    label: "4. From which regions do you need data for your use-case?",
    type: "text",
    required: true,
    placeholder: "List regions...",
  },
  {
    id: "purpose",
    label: "5. What is the intended purpose of your system?",
    type: "textarea",
    required: true,
    placeholder: "Describe the purpose...",
  },
  {
    id: "dateRange",
    label:
      "6. What is the date range for when you would like to start and complete the project?",
    type: "text",
    required: true,
    placeholder: "e.g., September 2025 - December 31, 2025",
  },
  {
    id: "delayFactors",
    label: "7. Are there any factors that might extend your project timeline?",
    type: "textarea",
    required: false,
    placeholder: "Describe any potential delays...",
  },
];

const SUB_QUESTION_OPTIONS = {
  internal: [
    { value: "ai-system", label: "AI-System" },
    { value: "cybersecurity", label: "Cybersecurity Management system" },
  ],
  thirdparty: [
    { value: "thirdparty-ai", label: "Third-party AI-System" },
    { value: "thirdparty-cyber", label: "Third-party Cybersecurity" },
  ],
};
const SUB_QUESTION_LABEL = "8. Please select the system type:";

// --- Four distinct example data sets ---
const EXAMPLE_DATA = {
  "thirdparty-ai": {
    general: {
      requestOwner: "Priya Singh, India",
      projectType: "thirdparty",
      projectName: "Third-Party Document Analyzer",
      region: "India, United States, European Union",
      purpose:
        "To automate document screening and risk analysis using a third-party artificial intelligence platform, aiming to improve operational efficiency and compliance.",
      dateRange: "September 1, 2025 - December 31, 2025",
      delayFactors:
        "Integration complexity with our existing systems, potential delays from the data partner, and regulatory approval timelines.",
      subSystemType: "thirdparty-ai",
    },
    answers: [
      "We use advanced encryption for models at rest and in transit, coupled with strict access controls and regular vulnerability scanning.",
      "Yes, we have a 'human-in-the-loop' protocol that allows our compliance team to manually review and override any high-impact AI decisions before they are finalized.",
      "Yes",
      "Yes",
      "We provide comprehensive API documentation, detailed model cards, and interactive SHAP value visualizations to ensure transparency for all stakeholders.",
      "Yes",
      "We employ a multi-layered approach including data provenance checks, statistical anomaly detection, and adversarial sample detection to ensure data integrity.",
      "Yes",
      "We have a dedicated AI incident response plan with a 2-hour notification SLA for clients in case of any security or performance incident.",
      "We use fairness metrics like Equalized Odds and Demographic Parity, tested against benchmark datasets such as Aequitas, before any model is deployed in a high-risk domain.",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "All sensitive data is protected using AES-256 encryption at rest and TLS 1.3 in transit. We also apply k-anonymization techniques for analytics.",
      "Yes",
      "We utilize input sanitization libraries to block malicious code and content filters to validate that outputs are appropriate and on-topic.",
    ],
  },
  "internal-ai": {
    general: {
      requestOwner: "Rohan Verma, India",
      projectType: "internal",
      projectName: "Factory Maintenance Predictor",
      region: "India",
      purpose:
        "To develop an in-house predictive maintenance model for our manufacturing equipment to reduce downtime and optimize repair schedules.",
      dateRange: "October 1, 2025 - March 31, 2026",
      delayFactors:
        "Availability of historical sensor data and initial model training time.",
      subSystemType: "ai-system",
    },
    answers: [
      "Proprietary LSTM-based model developed internally.",
      "Licensed under internal corporate IP policy, available on our intranet.",
      "No",
      "Model architecture and data flow diagrams are available on our internal Confluence page.",
      "The model was fine-tuned on a 5-year dataset from our primary production line. Evaluation was done using Mean Absolute Error (MAE) and R-squared metrics.",
      "Data is not retained post-inference. Logs are kept for 72 hours for debugging.",
      "A formal risk analysis identified model drift as the primary risk. Mitigation includes continuous monitoring and a manual override system for maintenance alerts.",
      "Effectiveness testing showed a 25% reduction in unplanned downtime in a simulated environment.",
      "Pre-deployment testing included adversarial checks on sensor data inputs and bias analysis to ensure no specific machine type was unfairly penalized.",
      "We use SHAP (SHapley Additive exPlanations) values to explain each prediction, providing transparency to maintenance engineers.",
      "Model performance (MAE) is monitored in real-time on a Grafana dashboard. The model is recalibrated quarterly.",
      "Data is sourced directly from our own IoT sensors on the factory floor. They are trusted and calibrated regularly.",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
    ],
  },
  "internal-cyber": {
    general: {
      requestOwner: "Anjali Sharma, India",
      projectType: "internal",
      projectName: "Internal SIEM Implementation",
      region: "Global",
      purpose:
        "To implement a new internal Security Information and Event Management (SIEM) system to enhance our threat detection and response capabilities.",
      dateRange: "September 15, 2025 - January 31, 2026",
      delayFactors:
        "Integration with legacy systems and training of security operations staff.",
      subSystemType: "cybersecurity",
    },
    answers: [
      "Yes, we used the STRIDE threat modeling framework. Risks identified included data poisoning and unauthorized access, mitigated through strict access controls and log integrity checks.",
      "Sensitive data is encrypted at rest using AES-256 and in transit with TLS 1.3. Access is strictly controlled via our Privileged Access Management (PAM) system.",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Security incidents are detected via automated alerts, reported through our ITSM tool, and escalated according to a tiered response matrix.",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
    ],
  },
  "thirdparty-cyber": {
    general: {
      requestOwner: "Vikram Reddy, India",
      projectType: "thirdparty",
      projectName: "Cloud Security (CASB) Project",
      region: "North America, Europe",
      purpose:
        "To integrate a third-party Cloud Access Security Broker (CASB) to secure our corporate cloud applications and enforce data loss prevention policies.",
      dateRange: "November 1, 2025 - February 28, 2026",
      delayFactors:
        "Contract negotiations and complexity of policy migration from our old system.",
      subSystemType: "thirdparty-cyber",
    },
    answers: [
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "We perform annual security audits of all critical third-party partners; evidence can be provided upon request under NDA.",
      "Yes",
      "Yes",
      "Annually",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Quarterly",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
      "Yes",
    ],
  },
};

const Questionnaire = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [responses, setResponses] = useState({});
  const [subSelection, setSubSelection] = useState("");
  const [templateQuestions, setTemplateQuestions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editDialog, setEditDialog] = useState({ open: false, index: null });
  const [addDialog, setAddDialog] = useState(false);
  const [editData, setEditData] = useState({});
  const [newQuestion, setNewQuestion] = useState({
    type: "text",
    label: "",
    options: [],
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const data = await templateService.getTemplates();
        setTemplates(Array.isArray(data) ? data : []);
      } catch (err) {
        setError("Failed to load assessment templates.");
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (!subSelection) {
      setTemplateQuestions([]);
      return;
    }
    const templateTypeMap = {
      "ai-system": "AI System",
      cybersecurity: "Cybersecurity Management System",
      "thirdparty-ai": "Third-party AI System",
      "thirdparty-cyber": "Third-party Cybersecurity System",
    };
    const currentTemplateType = templateTypeMap[subSelection];

    if (currentTemplateType) {
      const found = templates.find(
        (t) => t.templateType === currentTemplateType
      );
      if (found && found.questions) {
        setTemplateQuestions(
          found.questions.map((q) => ({
            id: q.id || q._id || q.questionText,
            questionText: q.questionText,
            responseType: q.responseType,
            isRequired: q.isRequired,
          }))
        );
      } else {
        setTemplateQuestions([]);
      }
    } else {
      setTemplateQuestions([]);
    }
  }, [subSelection, templates]);

  const handleGeneralChange = (id, value) => {
    setResponses((prev) => ({ ...prev, [id]: value }));
    if (id === "projectType") {
      setSubSelection("");
      // Clear previous template answers
      const templateKeys = templateQuestions.map((q) => q.id);
      const newResponses = { ...responses };
      templateKeys.forEach((key) => delete newResponses[key]);
      newResponses[id] = value;
      setResponses(newResponses);
      setTemplateQuestions([]);
    }
  };

  const handleSubSelection = (value) => {
    setSubSelection(value);
    setResponses((prev) => ({ ...prev, subSystemType: value }));
  };

  const handleTemplateChange = (id, value) => {
    setResponses((prev) => ({ ...prev, [id]: value }));
  };

  const loadExample = (type) => {
    const example = EXAMPLE_DATA[type];
    if (!example) return;

    // Set general info and trigger sub-selection, which loads the questions via useEffect
    setResponses(example.general);
    setSubSelection(example.general.subSystemType);

    // Find the correct template to map answers to the correct question IDs
    const templateTypeMap = {
      "ai-system": "AI System",
      cybersecurity: "Cybersecurity Management System",
      "thirdparty-ai": "Third-party AI System",
      "thirdparty-cyber": "Third-party Cybersecurity System",
    };
    const currentTemplateType = templateTypeMap[example.general.subSystemType];
    const template = templates.find(
      (t) => t.templateType === currentTemplateType
    );

    if (template && template.questions) {
      const templateResponseMap = {};
      template.questions.forEach((q, index) => {
        const questionId = q.id || q._id || q.questionText; // Use the same unique ID
        templateResponseMap[questionId] = example.answers[index] || "";
      });
      // Set the specific answers for the loaded template questions
      setResponses((prev) => ({ ...prev, ...templateResponseMap }));
    }
    setSubmitAttempted(false);
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    setError("");
    setSuccess("");

    // --- Validation logic ---
    const requiredGeneral = GENERAL_QUESTIONS.filter((q) => q.required).every(
      (q) => responses[q.id]
    );
    if (!requiredGeneral) {
      setError("Please answer all required general questions.");
      return;
    }
    if (responses.projectType && !subSelection) {
      setError("Please select the system type.");
      return;
    }
    const requiredTemplate = templateQuestions
      .filter((q) => q.isRequired)
      .every((q) => responses[q.id]);
    if (!requiredTemplate) {
      setError("Please answer all required system-specific questions.");
      return;
    }

    setIsSubmitting(true);
    try {
      const templateTypeMap = {
        "ai-system": "AI System",
        cybersecurity: "Cybersecurity Management System",
        "thirdparty-ai": "Third-party AI System",
        "thirdparty-cyber": "Third-party Cybersecurity System",
      };
      const useCaseType = templateTypeMap[subSelection];

      const questionnaireData = {
        questionnaireResponses: responses,
        projectId: DEFAULT_PROJECT_ID,
        useCaseType: useCaseType,
      };

      await questionnaireService.processQuestionnaire(questionnaireData);
      setSuccess(
        "Questionnaire submitted successfully! Risk analysis is being generated."
      );
      setTimeout(() => navigate(`/dashboard`), 2000);
    } catch (err) {
      setError(
        err.message || "Failed to submit questionnaire. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Admin Dialog Handlers remain the same ---
  const handleEdit = (index) => {
    setEditData({ ...templateQuestions[index] });
    setEditDialog({ open: true, index });
  };
  const handleEditSave = () => {
    const updated = [...templateQuestions];
    updated[editDialog.index] = { ...editData };
    setTemplateQuestions(updated);
    setEditDialog({ open: false, index: null });
  };
  const handleAdd = () => {
    setNewQuestion({ type: "text", label: "", options: [] });
    setAddDialog(true);
  };
  const handleAddSave = () => {
    if (!newQuestion.label.trim()) return;
    setTemplateQuestions([
      ...templateQuestions,
      {
        ...newQuestion,
        id: nanoid(),
        options: newQuestion.options || [],
        value: newQuestion.type === "checkbox" ? [] : "",
      },
    ]);
    setAddDialog(false);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const showSubQuestionWarning =
    submitAttempted && responses.projectType && !subSelection;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", mb: 2, flexWrap: "wrap" }}
      >
        <Tooltip title="Go back">
          <IconButton onClick={() => navigate(-1)}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1, ml: 1 }}>
          AI Use Case Questionnaire
        </Typography>
        
        {isAdmin() && (
          <Tooltip title="Add New Question">
            <IconButton
              color="primary"
              onClick={handleAdd}
              aria-label="add question"
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Paper elevation={3} sx={{ p: { xs: 2, sm: 4 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Typography variant="h6" gutterBottom>
          General Information
        </Typography>
        <Divider sx={{ mb: 3 }} />

        {GENERAL_QUESTIONS.map((q) => {
          const showWarning = submitAttempted && q.required && !responses[q.id];
          if (q.type === "radio") {
            return (
              <FormControl
                key={q.id}
                fullWidth
                margin="normal"
                error={showWarning}
              >
                <FormLabel>{q.label}</FormLabel>
                <RadioGroup
                  name={q.id}
                  value={responses[q.id] || ""}
                  onChange={(e) => handleGeneralChange(q.id, e.target.value)}
                >
                  {q.options.map((opt) => (
                    <FormControlLabel
                      key={opt.value}
                      value={opt.value}
                      control={<Radio />}
                      label={opt.label}
                    />
                  ))}
                </RadioGroup>
                {showWarning && (
                  <FormHelperText>This question is required.</FormHelperText>
                )}
              </FormControl>
            );
          }
          return (
            <TextField
              key={q.id}
              fullWidth
              margin="normal"
              variant="outlined"
              label={q.label}
              placeholder={q.placeholder}
              multiline={q.type === "textarea"}
              rows={q.type === "textarea" ? 3 : 1}
              value={responses[q.id] || ""}
              onChange={(e) => handleGeneralChange(q.id, e.target.value)}
              error={showWarning}
              helperText={showWarning ? "This field is required." : ""}
            />
          );
        })}

        {responses.projectType && (
          <FormControl fullWidth margin="normal" error={showSubQuestionWarning}>
            <FormLabel>{SUB_QUESTION_LABEL}</FormLabel>
            <RadioGroup
              name="subSystemType"
              value={subSelection}
              onChange={(e) => handleSubSelection(e.target.value)}
            >
              {SUB_QUESTION_OPTIONS[responses.projectType].map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  control={<Radio />}
                  label={opt.label}
                />
              ))}
            </RadioGroup>
            {showSubQuestionWarning && (
              <FormHelperText>Please select the system type.</FormHelperText>
            )}
          </FormControl>
        )}

        {templateQuestions.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              System Specific Questions
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {templateQuestions.map((q, idx) => {
              const showWarning =
                submitAttempted && q.isRequired && !responses[q.id];
              const questionNumber =
                GENERAL_QUESTIONS.length + (responses.projectType ? 2 : 1);
              return (
                <Box key={q.id} sx={{ my: 3 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <FormLabel
                      component="legend"
                      sx={{ flexGrow: 1, fontWeight: "medium" }}
                    >
                      {`${questionNumber}.${idx + 1} ${q.questionText}`}
                    </FormLabel>
                    {isAdmin() && (
                      <Tooltip title="Edit Question">
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(idx)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  {q.responseType === "boolean" ? (
                    <FormControl error={showWarning} sx={{ pl: 1, mt: 1 }}>
                      <RadioGroup
                        row
                        value={responses[q.id] || ""}
                        onChange={(e) =>
                          handleTemplateChange(q.id, e.target.value)
                        }
                      >
                        <FormControlLabel
                          value="Yes"
                          control={<Radio />}
                          label="Yes"
                        />
                        <FormControlLabel
                          value="No"
                          control={<Radio />}
                          label="No"
                        />
                      </RadioGroup>
                    </FormControl>
                  ) : (
                    <TextField
                      fullWidth
                      variant="outlined"
                      multiline
                      rows={2}
                      value={responses[q.id] || ""}
                      onChange={(e) =>
                        handleTemplateChange(q.id, e.target.value)
                      }
                      error={showWarning}
                      sx={{ mt: 1 }}
                    />
                  )}
                  {showWarning && (
                    <FormHelperText error sx={{ pl: 1 }}>
                      This question is required.
                    </FormHelperText>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

        <Box mt={4} display="flex" justifyContent="center">
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={handleSubmit}
            disabled={isSubmitting}
            startIcon={
              isSubmitting ? (
                <CircularProgress size={20} color="inherit" />
              ) : null
            }
            sx={{ px: 5, py: 1.5, fontWeight: "bold", borderRadius: 10 }}
          >
            {isSubmitting ? "Processing..." : "Submit"}
          </Button>
        </Box>
      </Paper>

      {/* --- Dialogs for Admin remain functional --- */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, index: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Question</DialogTitle>
        <DialogContent>
          <TextField
            label="Question"
            fullWidth
            value={editData.label || ""}
            onChange={(e) =>
              setEditData({ ...editData, label: e.target.value })
            }
            margin="normal"
          />
          {(editData.type === "radio" || editData.type === "checkbox") && (
            <OptionEditor
              options={editData.options || []}
              onChange={(opts) => setEditData({ ...editData, options: opts })}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, index: null })}>
            Cancel
          </Button>
          <Button onClick={handleEditSave} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={addDialog}
        onClose={() => setAddDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New Question</DialogTitle>
        <DialogContent>
          <TextField
            label="Question"
            fullWidth
            value={newQuestion.label}
            onChange={(e) =>
              setNewQuestion({ ...newQuestion, label: e.target.value })
            }
            margin="normal"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Type</InputLabel>
            <Select
              value={newQuestion.type}
              label="Type"
              onChange={(e) =>
                setNewQuestion({
                  ...newQuestion,
                  type: e.g.target.value,
                  options: [],
                })
              }
            >
              {["text", "textarea", "radio", "checkbox"].map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {(newQuestion.type === "radio" ||
            newQuestion.type === "checkbox") && (
            <OptionEditor
              options={newQuestion.options || []}
              onChange={(opts) =>
                setNewQuestion({ ...newQuestion, options: opts })
              }
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
          <Button onClick={handleAddSave} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Questionnaire;
