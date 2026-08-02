
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import riskMatrixService from "../../../services/riskMatrixService";

// Standalone page (no :projectId in its route), so risks it creates are
// grouped under this fixed pseudo-project id.
const PROJECT_ID = "cybersecurity-risk-manager";

// The Risks model stores a 1-5 numeric severity, not the impact/probability
// labels this table displays; derive a label for display purposes.
const severityToLevel = (severity) => {
  if (severity >= 5) return "Extreme";
  if (severity >= 4) return "High";
  if (severity >= 3) return "Medium";
  if (severity >= 2) return "Low";
  return "Minor";
};

const mapRiskForTable = (risk) => ({
  id: risk.riskAssessmentId || risk._id,
  _id: risk._id,
  riskDescription: risk.riskName,
  assetOwner: risk.riskOwner,
  impact: severityToLevel(risk.severity),
  rawProbability: severityToLevel(risk.severity),
  rawImpact: severityToLevel(risk.severity),
  rawRiskRating: severityToLevel(risk.severity),
  riskTreatment: risk.mitigation || "N/A",
  treatmentCost: "N/A",
  treatmentStatus: risk.status || "Not Set",
  treatedProbability: "N/A",
  treatedImpact: "N/A",
  targetRiskRating: "N/A",
  currentRiskRating: severityToLevel(risk.severity),
  notes: risk.justification || "",
});

const RiskManager = () => {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await riskMatrixService.getRisksByProject(PROJECT_ID, {
        limit: 100,
      });
      setRisks((result.risks || []).map(mapRiskForTable));
    } catch (e) {
      console.error("Error fetching risks:", e);
      setError(e.message || "Failed to load risks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const getRiskColor = (level) => {
    switch (level) {
      case "Extreme":
        return "bg-red-100 text-red-800";
      case "High":
        return "bg-orange-100 text-orange-800";
      case "Medium":
        return "bg-yellow-100 text-yellow-800";
      case "Low":
        return "bg-green-100 text-green-800";
      case "Minor":
        return "bg-blue-100 text-blue-800";
      case "Insignificant":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-800";
      case "In Progress":
        return "bg-yellow-100 text-yellow-800";
      case "Planned":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleAddRisk = async (riskData) => {
    try {
      // riskAssessmentId/sessionId are required by the backend but this is a
      // freeform manual-entry page with no questionnaire session behind it,
      // so generate standalone ids the same way the AI Risk Assessment page does.
      const randomId = Math.floor(Math.random() * 900 + 100);
      const enrichedRiskData = {
        ...riskData,
        riskAssessmentId: `CB-${randomId}`,
        sessionId: `S-${Date.now().toString().slice(-6)}`,
      };

      await riskMatrixService.addRisk(PROJECT_ID, enrichedRiskData);
      await fetchRisks();
    } catch (error) {
      console.error("Error adding risk:", error);
      window.showNotification?.(
        "error",
        "Failed to add risk",
        error.message || "Unknown error"
      );
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen ">
      <div className="w-full mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Risk Management Dashboard</h1>
            <p className="text-gray-600 mt-2">
              Comprehensive overview of all identified risks and their treatment status
              {!loading && !error && ` — ${risks.length} risk${risks.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button 
            className="gap-2"
            onClick={() => {
              const riskName = prompt("Enter risk description:");
              const riskOwner = prompt("Enter asset owner:");
              const severity = prompt("Enter severity (1-5):");
              
              if (riskName && riskOwner && severity) {
                handleAddRisk({
                  riskName,
                  riskOwner,
                  severity: parseInt(severity),
                  justification: "",
                  mitigation: "",
                  targetDate: null
                });
              }
            }}
          >
            <Plus className="w-4 h-4" />
            Create
          </Button>
        </div>

        <Card className='max-w-[1550px]'>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading risks…</div>
            ) : error ? (
              <div className="p-6 text-center text-red-600">{error}</div>
            ) : risks.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No risks found. Click "Create" to add one.</div>
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk ID</TableHead>
                    <TableHead>Risk Description</TableHead>
                    <TableHead>Asset Owner</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Raw Probability</TableHead>
                    <TableHead>Raw Impact</TableHead>
                    <TableHead>Raw Risk Rating</TableHead>
                    <TableHead>Risk Treatment</TableHead>
                    <TableHead>Treatment Cost</TableHead>
                    <TableHead>Treatment Status</TableHead>
                    <TableHead>Treated Probability</TableHead>
                    <TableHead>Treated Impact</TableHead>
                    <TableHead>Target Risk Rating</TableHead>
                    <TableHead>Current Risk Rating</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risks.map((risk) => (
                    <TableRow key={risk.id}>
                      <TableCell className="font-medium">{risk.id}</TableCell>
                      <TableCell>{risk.riskDescription}</TableCell>
                      <TableCell>{risk.assetOwner}</TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.impact)}>{risk.impact}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.rawProbability)}>{risk.rawProbability}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.rawImpact)}>{risk.rawImpact}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.rawRiskRating)}>{risk.rawRiskRating}</Badge>
                      </TableCell>
                      <TableCell>{risk.riskTreatment}</TableCell>
                      <TableCell>{risk.treatmentCost}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(risk.treatmentStatus)}>{risk.treatmentStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.treatedProbability)}>{risk.treatedProbability}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.treatedImpact)}>{risk.treatedImpact}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.targetRiskRating)}>{risk.targetRiskRating}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskColor(risk.currentRiskRating)}>{risk.currentRiskRating}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{risk.notes}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex justify-center items-center mt-6 gap-4">
          <Button variant="outline" size="sm">Previous page</Button>
          <span className="text-sm text-gray-600">1/1</span>
          <Button variant="outline" size="sm">Next</Button>
        </div>
      </div>
    </div>
  );
};

export default RiskManager;