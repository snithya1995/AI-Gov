import React, { useState } from "react";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AddRiskModal = ({ onAddRisk }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // form state
  const [newRiskName, setNewRiskName] = useState("");
  const [newRiskOwner, setNewRiskOwner] = useState("");
  const [newRiskSeverity, setNewRiskSeverity] = useState("3");
  const [newRiskLikelihood, setNewRiskLikelihood] = useState("Possible");
  const [newRiskMitigation, setNewRiskMitigation] = useState("");
  const [newRiskJustification, setNewRiskJustification] = useState("");
  const [newRiskTargetDate, setNewRiskTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newRiskName.trim() || !newRiskOwner.trim() || !newRiskSeverity) {
      return; // simple validation
    }

    const newRisk = {
      riskName: newRiskName,
      riskOwner: newRiskOwner,
      severity: parseInt(newRiskSeverity, 10),
      likelihood: newRiskLikelihood,
      mitigation: newRiskMitigation,
      justification: newRiskJustification,
      targetDate: newRiskTargetDate,
      isActive: true,
    };

    setSubmitting(true);
    try {
      await onAddRisk?.(newRisk); // send risk back to parent, wait for it to persist

      // reset + close only once the risk is actually saved
      setNewRiskName("");
      setNewRiskOwner("");
      setNewRiskSeverity("3");
      setNewRiskLikelihood("Possible");
      setNewRiskMitigation("");
      setNewRiskJustification("");
      setNewRiskTargetDate("");
      setIsModalOpen(false);
    } catch {
      // Parent already surfaces the error notification; keep the dialog open
      // with the entered data intact so the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{
            backgroundColor: "#059669",
            color: "#fff",
            textTransform: "none",
            "&:hover": { backgroundColor: "#047857" },
            borderRadius: "6px",
            boxShadow: "none",
          }}
        >
          Add new risk
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Risk</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="riskName" className="text-right">
              Name
            </Label>
            <Input
              id="riskName"
              value={newRiskName}
              onChange={(e) => setNewRiskName(e.target.value)}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="riskOwner" className="text-right">
              Owner
            </Label>
            <Input
              id="riskOwner"
              value={newRiskOwner}
              onChange={(e) => setNewRiskOwner(e.target.value)}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="severity" className="text-right">
              Severity
            </Label>
            <Select value={newRiskSeverity} onValueChange={setNewRiskSeverity}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 - Critical</SelectItem>
                <SelectItem value="4">4 - High</SelectItem>
                <SelectItem value="3">3 - Medium</SelectItem>
                <SelectItem value="2">2 - Low</SelectItem>
                <SelectItem value="1">1 - Very Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="mitigation" className="text-right">
              Mitigation
            </Label>
            <Textarea
              id="mitigation"
              value={newRiskMitigation}
              onChange={(e) => setNewRiskMitigation(e.target.value)}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="justification" className="text-right">
              Justification
            </Label>
            <Textarea
              id="justification"
              value={newRiskJustification}
              onChange={(e) => setNewRiskJustification(e.target.value)}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="targetDate" className="text-right">
              Target Date
            </Label>
            <Input
              id="targetDate"
              type="date"
              value={newRiskTargetDate}
              onChange={(e) => setNewRiskTargetDate(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Adding..." : "Add Risk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddRiskModal;
