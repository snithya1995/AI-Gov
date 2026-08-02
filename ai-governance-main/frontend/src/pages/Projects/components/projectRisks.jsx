import React, { useState, useEffect } from "react";
import SettingsIcon from "@mui/icons-material/Settings";
import riskMatrixService from "../../../services/riskMatrixService";
import AddRiskModal from "../modals/RiskModal";

const ProjectRisks = ({ projectId }) => {
  const [risks, setRisks] = useState([]);
  const [riskSummary, setRiskSummary] = useState([
    { label: "Very High", color: "red", count: 0 },
    { label: "High", color: "orange", count: 0 },
    { label: "Medium", color: "amber", count: 0 },
    { label: "Low", color: "green", count: 0 },
    { label: "Very Low", color: "teal", count: 0 },
  ]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRisks, setTotalRisks] = useState(0);

  useEffect(() => {
    if (projectId) {
      fetchProjectRisks(page, limit);
    }
  }, [projectId, page, limit]);

  const fetchProjectRisks = async (currentPage = page, currentLimit = limit) => {
    try {
      setLoading(true);
      const response = await riskMatrixService.getRisksByProject(projectId, {
        page: currentPage,
        limit: currentLimit,
      });
      const projectRisks = response.risks || [];
      const total = response.pagination?.total || 0;
      const pages = response.pagination?.pages || 1;

      setTotalRisks(total);
      setTotalPages(pages);

      // Update risks data
      setRisks(
        projectRisks.map((risk) => ({
          id: risk.riskAssessmentId,
          name: risk.riskName || "Risk Assessment",
          owner: risk.riskOwner || "Unknown",
          severity: risk.severity,
          likelihood: "Possible", // Default value
          mitigation: risk.mitigation || "No mitigation specified",
          status: risk.isActive ? "Active" : "Inactive",
          riskLevel: getRiskLevelFromSeverity(risk.severity),
          riskLevelColor: getRiskLevelColor(
            getRiskLevelFromSeverity(risk.severity)
          ),
          targetDate: risk.targetDate
            ? new Date(risk.targetDate).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "No target date",
          justification: risk.justification || "No justification provided",
        }))
      );

      // Fetch overall project risk stats for the summary bar
      try {
        const stats = await riskMatrixService.getRiskStatistics(projectId);
        const levels = stats.riskLevels || {};
        setRiskSummary([
          { label: "Very High", color: "red", count: levels.Critical || 0 },
          { label: "High", color: "orange", count: levels.High || 0 },
          { label: "Medium", color: "amber", count: levels.Medium || 0 },
          { label: "Low", color: "green", count: levels.Low || 0 },
          { label: "Very Low", color: "teal", count: levels['Very Low'] || 0 },
        ]);
      } catch (statsErr) {
        console.error("Failed to fetch risk stats, falling back to page calculation", statsErr);
        const summary = calculateRiskSummary(projectRisks);
        setRiskSummary(summary);
      }
    } catch (error) {
      console.error("Error fetching project risks:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelFromSeverity = (severity) => {
    switch (severity) {
      case 5:
        return "Critical Risk";
      case 4:
        return "High Risk";
      case 3:
        return "Medium Risk";
      case 2:
        return "Low Risk";
      case 1:
        return "Very Low Risk";
      default:
        return "Medium Risk";
    }
  };

  const getRiskLevelColor = (riskLevel) => {
    switch (riskLevel) {
      case "Critical Risk":
        return "bg-red-400 text-red-900";
      case "High Risk":
        return "bg-orange-400 text-orange-900";
      case "Medium Risk":
        return "bg-amber-400 text-amber-900";
      case "Low Risk":
        return "bg-green-400 text-green-900";
      case "Very Low Risk":
        return "bg-teal-400 text-teal-900";
      default:
        return "bg-amber-400 text-amber-900";
    }
  };

  const calculateRiskSummary = (projectRisks) => {
    const summary = [
      { label: "Very High", color: "red", count: 0 },
      { label: "High", color: "orange", count: 0 },
      { label: "Medium", color: "amber", count: 0 },
      { label: "Low", color: "green", count: 0 },
      { label: "Very Low", color: "teal", count: 0 },
    ];

    projectRisks.forEach((risk) => {
      const severity = risk.severity;
      if (severity === 5) summary[0].count++;
      else if (severity === 4) summary[1].count++;
      else if (severity === 3) summary[2].count++;
      else if (severity === 2) summary[3].count++;
      else if (severity === 1) summary[4].count++;
    });

    return summary;
  };

  // Handle risk add from modal
  const handleAddRisk = async (newRisk) => {
    // riskAssessmentId/sessionId are required by the backend but this modal
    // is a manual, freeform add with no questionnaire session behind it, so
    // generate standalone ids the same way the AI Risk Assessment page does.
    const randomId = Math.floor(Math.random() * 900 + 100);
    const enrichedRisk = {
      ...newRisk,
      riskAssessmentId: `PR-${randomId}`,
      sessionId: `S-${Date.now().toString().slice(-6)}`,
    };

    try {
      await riskMatrixService.addRisk(projectId, enrichedRisk);
      await fetchProjectRisks();
      window.showNotification?.("success", "Risk added", `"${newRisk.riskName}" was added successfully.`);
    } catch (err) {
      console.error("Error adding new risk:", err);
      window.showNotification?.("error", "Failed to add risk", err.message || "Unknown error");
      throw err; // let the modal know the add failed so it can keep the form open
    }
  };

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [genSuccess, setGenSuccess] = useState("");

  const handleGenerateRisks = async () => {
    try {
      setGenerating(true);
      setGenError("");
      setGenSuccess("");
      await riskMatrixService.generateProjectRisks(projectId);
      setGenSuccess("AI Risks and Controls generated successfully! Governance scores recalculated.");
      fetchProjectRisks();
      setTimeout(() => {
        setGenSuccess("");
      }, 5000);
    } catch (err) {
      console.error("Failed to generate AI risks:", err);
      setGenError(err.message || "Failed to generate AI risks");
      setTimeout(() => {
        setGenError("");
      }, 5000);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8">
      {/* Risk Summary Bar */}
      <div className="border border-gray-200 rounded-lg px-8 py-4 mb-8 bg-white flex justify-between items-center max-w-4xl mx-auto">
        {riskSummary.map((risk) => (
          <div key={risk.label} className="flex flex-col items-center flex-1">
            <div className={`font-medium text-${risk.color}-500`}>
              {risk.label}
            </div>
            <div className={`text-2xl font-bold text-${risk.color}-800`}>
              {risk.count}
            </div>
          </div>
        ))}
      </div>

      {/* Header and Actions */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-lg font-semibold flex items-center gap-2">
          <span>Project risks</span>
          {generating && (
            <span className="text-xs text-indigo-600 animate-pulse font-normal">
              (AI Agent is assessing risks based on questionnaire, assets & requirements...)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateRisks}
            disabled={generating || loading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300 shadow-md flex items-center gap-2 text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0`}
          >
            {generating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" width="16" height="16">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating Risks...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.982-8.982M18 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Generate/Regenerate AI Risks
              </>
            )}
          </button>
          <AddRiskModal onAddRisk={handleAddRisk} />
        </div>
      </div>

      {/* Messages */}
      {genSuccess && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium animate-fade-in flex items-center gap-2">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {genSuccess}
        </div>
      )}
      {genError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium animate-fade-in flex items-center gap-2">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {genError}
        </div>
      )}

      {/* Risks Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-3 text-gray-500 font-medium">RISK ID</th>
              <th className="px-4 py-3 text-gray-500 font-medium">RISK NAME</th>
              <th className="px-4 py-3 text-gray-500 font-medium">OWNER</th>
              <th className="px-4 py-3 text-gray-500 font-medium">SEVERITY</th>
              <th className="px-4 py-3 text-gray-500 font-medium">MITIGATION</th>
              <th className="px-4 py-3 text-gray-500 font-medium">STATUS</th>
              <th className="px-4 py-3 text-gray-500 font-medium">RISK LEVEL</th>
              <th className="px-4 py-3 text-gray-500 font-medium">TARGET DATE</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                  Loading project risks...
                </td>
              </tr>
            ) : risks.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                  No risks found for this project.
                </td>
              </tr>
            ) : (
              risks.map((risk, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{risk.id}</td>
                  <td className="px-4 py-3 font-medium">{risk.name}</td>
                  <td className="px-4 py-3">{risk.owner}</td>
                  <td className="px-4 py-3">{risk.severity}</td>
                  <td
                    className="px-4 py-3 max-w-xs truncate"
                    title={risk.mitigation}
                  >
                    {risk.mitigation}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        risk.status === "Active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {risk.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded font-semibold ${risk.riskLevelColor}`}
                    >
                      {risk.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3">{risk.targetDate}</td>
                  <td className="px-4 py-3">
                    <SettingsIcon className="text-gray-400 cursor-pointer" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Table Footer */}
        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500 bg-gray-50 rounded-b-lg">
          <div>
            {loading
              ? "Loading..."
              : `Showing ${totalRisks === 0 ? 0 : (page - 1) * limit + 1} - ${Math.min(page * limit, totalRisks)} of ${totalRisks} project risk(s)`}
          </div>
          <div className="flex items-center gap-2">
            <span>Project risks per page</span>
            <select
              className="border rounded px-2 py-1 cursor-pointer"
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value));
                setPage(1);
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
            <span>Page {page} of {totalPages}</span>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(1)}
              className={`${page === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-black cursor-pointer'} px-1 font-semibold`}
            >
              &lt;&lt;
            </button>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className={`${page === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-black cursor-pointer'} px-1 font-semibold`}
            >
              &lt;
            </button>
            <button
              disabled={page === totalPages || loading}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              className={`${page === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-black cursor-pointer'} px-1 font-semibold`}
            >
              &gt;
            </button>
            <button
              disabled={page === totalPages || loading}
              onClick={() => setPage(totalPages)}
              className={`${page === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-black cursor-pointer'} px-1 font-semibold`}
            >
              &gt;&gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectRisks;
