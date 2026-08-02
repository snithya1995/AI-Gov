import React, { useEffect, useState, Fragment, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  ChevronsUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"; // 1. Import pagination icons
import controlService from "@/services/controlService";
import { Menu, Transition } from "@headlessui/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getProjects } from "@/services/projectService";

// Import Combobox components from your UI library
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ... (getStatusBadge, statusOptions, etc. remain the same) ...
const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "Implemented", label: "Implemented" },
  { value: "In Progress", label: "In Progress" },
  { value: "Not Implemented", label: "Not Implemented" },
];

const dropdownStatusOptions = ["Implemented", "In Progress", "Not Implemented"];

const getStatusBadge = (status) => {
  switch (status) {
    case "Implemented":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-700">
          {status}
        </Badge>
      );
    case "In Progress":
      return (
        <Badge className="bg-yellow-600 text-white hover:bg-yellow-700">
          In Progress
        </Badge>
      );
    case "Not Implemented":
      return (
        <Badge className="bg-red-600 text-white hover:bg-red-700">
          {status}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const AIControlAssessment = () => {
  const [controls, setControls] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  // Add state for the Combobox popover
  const [isProjectPopoverOpen, setProjectPopoverOpen] = useState(false);

  // 2. Add Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15); // Set items per page to 15

  // 3. Add useEffect to reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [status, selectedProjectId]);

  const fetchProjects = async () => {
    try {
      const response = await getProjects();
      const allProjects = response.data || response || [];
      const formattedProjects = allProjects.map(p => ({
        id: p.projectId || p._id || p.id,
        name: p.projectName || p.name || p.title
      }));

      // Merge with any projects actually in the controls table to ensure nothing is missed
      const controlsResult = await controlService.getControlsBySystemType("AI", { limit: 1000 });
      const tableProjectIds = [...new Set((controlsResult.controls || []).map(c => c.projectId).filter(Boolean))];
      
      const finalProjects = [...formattedProjects];
      tableProjectIds.forEach(id => {
        if (!finalProjects.find(p => p.id === id)) {
          finalProjects.push({ id, name: id, projectId: id });
        }
      });
      
      // Ensure each has a projectId field for the selector
      const standardized = finalProjects.map(p => ({
        ...p,
        projectId: p.projectId || p.id
      }));

      setProjects(standardized);
    } catch (e) {
      console.error("Error fetching projects:", e);
    }
  };

  useEffect(() => {
    const fetchControls = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await controlService.getControlsBySystemType("AI", {
          limit: 1000, // Fetch all for local filtering (simple implementation)
        });

        const fetchedControls = result.controls || [];
        
        let filtered = fetchedControls;
        if (status !== "all") {
          filtered = filtered.filter(c => c.status === status);
        }
        if (selectedProjectId !== "all") {
          filtered = filtered.filter(c => c.projectId === selectedProjectId);
        }
        
        setControls(filtered);
      } catch (e) {
        setError(e.message || "Failed to load data");
        setControls([]);
      } finally {
        setLoading(false);
      }
    };

    fetchControls();
  }, [status, selectedProjectId]);

  useEffect(() => {
    fetchProjects();
  }, []);


  // ... (handleStatusChange, handleExportExcel, handleExportPDF remain the same) ...
  const handleStatusChange = (controlId, newStatus) => {
    const previousStatus = controls.find((c) => c._id === controlId)?.status;
    setControls((prevControls) =>
      prevControls.map((control) =>
        control._id === controlId ? { ...control, status: newStatus } : control
      )
    );
    controlService
      .updateControl(controlId, { status: newStatus })
      .catch((err) => {
        console.error("Failed to update control status:", err);
        // Roll back the optimistic update so the UI matches what's actually persisted
        setControls((prevControls) =>
          prevControls.map((control) =>
            control._id === controlId
              ? { ...control, status: previousStatus }
              : control
          )
        );
        window.showNotification?.(
          "error",
          "Status update failed",
          err.response?.data?.error || "Could not save the new status. Please try again."
        );
      });
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const response = await controlService.getControlsBySystemType("AI", {
        limit: 1000,
      });
      const allControls = response.controls || [];
      const dataToExport = allControls.map((control) => ({
        Code: control.code,
        Section: control.section,
        Control: control.control,
        Requirements: control.requirements,
        "Risk Associated": control.relatedRisks,
        Status: control.status,
        Tickets: control.tickets,
      }));
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "AI Controls");
      XLSX.writeFile(workbook, "AI_Controls_Export.xlsx");
    } catch (err) {
      console.error("Failed to export to Excel:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await controlService.getControlsBySystemType("AI", {
        limit: 1000,
      });
      const allControls = response.controls || [];
      const doc = new jsPDF();
      doc.text("AI System Controls Assessment Report", 14, 16);
      const tableColumn = ["Code", "Control", "Risk Associated", "Status"];
      const tableRows = allControls.map((control) => [
        control.code,
        control.control,
        control.relatedRisks || "N/A",
        control.status,
      ]);
      autoTable(doc, { head: [tableColumn], body: tableRows, startY: 20 });
      doc.save("AI_Controls_Export.pdf");
    } catch (err) {
      console.error("Failed to export to PDF:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // 4. Add Pagination Logic
  const totalControls = controls.length;
  const totalPages = Math.ceil(totalControls / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedControls = controls.slice(startIndex, startIndex + itemsPerPage);

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };
  // --- End Pagination Logic ---

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>AI System Controls Assessment</span>
          <div className="flex flex-wrap gap-4 z-10">
            {/* Export Menu remains the same */}
            <Menu as="div" className="relative inline-block text-left">
              {/* ... menu content ... */}
              <Menu.Button
                as={Button}
                variant="outline"
                className="w-[150px] h-10 justify-center"
                disabled={isExporting}
              >
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? "Exporting..." : "Export"}
              </Menu.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-popover p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleExportExcel}
                          className={cn(
                            "group flex w-full items-center rounded-md px-2 py-2 text-sm text-left",
                            active && "bg-secondary"
                          )}
                        >
                          Export as Excel (.xlsx)
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleExportPDF}
                          className={cn(
                            "group flex w-full items-center rounded-md px-2 py-2 text-sm text-left",
                            active && "bg-secondary"
                          )}
                        >
                          Export as PDF (.pdf)
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>

            {/* REPLACE the old project <Select> with this new <Popover> Combobox */}
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[250px] h-10">
                <SelectValue placeholder="Select a Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.projectId} value={p.projectId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter remains the same */}
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px] h-10">
                <SelectValue>
                  {statusOptions.find((opt) => opt.value === status)?.label ||
                    "All Statuses"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* ... The rest of your component (Table rendering) remains exactly the same ... */}
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">
            Loading controls…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-destructive">{error}</div>
        ) : controls.length === 0 ? ( // 5. Check original list length
          <div className="p-6 text-center text-muted-foreground">
            No controls found for the selected filters.
          </div>
        ) : (
          <> {/* 6. Wrap Table and Pagination */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CODE</TableHead>
                  <TableHead>SECTION</TableHead>
                  <TableHead>CONTROL</TableHead>
                  <TableHead>REQUIREMENTS</TableHead>
                  <TableHead>RISK ASSOCIATED</TableHead>
                  <TableHead>PROJECT</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>TICKETS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 7. Map over paginated list */}
                {paginatedControls.map((item) => (
                  <TableRow key={item._id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">
                      {item.code}
                    </TableCell>
                    <TableCell>{item.section}</TableCell>
                    <TableCell>{item.control}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md">
                      {item.requirements}
                    </TableCell>
                    <TableCell>{item.relatedRisks || "N/A"}</TableCell>
                    <TableCell>{item.projectId || "N/A"}</TableCell>
                    <TableCell>
                      <Menu
                        as="div"
                        className="relative inline-block text-left w-full"
                      >
                        <Menu.Button
                          as={Button}
                          variant="ghost"
                          className="w-full justify-start p-0 h-auto"
                        >
                          {getStatusBadge(item.status)}
                        </Menu.Button>
                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute right-0 mt-2 w-40 origin-top-right rounded-md bg-popover p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                            <div className="px-1 py-1">
                              {dropdownStatusOptions.map((dropdownStatus) => (
                                <Menu.Item
                                  key={dropdownStatus}
                                  disabled={item.status === dropdownStatus}
                                >
                                  {({ active, disabled }) => (
                                    <button
                                      onClick={() =>
                                        handleStatusChange(
                                          item._id,
                                          dropdownStatus
                                        )
                                      }
                                      className={cn(
                                        "group flex w-full items-center rounded-md px-2 py-2 text-sm text-left",
                                        active && "bg-secondary",
                                        disabled &&
                                          "opacity-50 cursor-not-allowed"
                                      )}
                                      disabled={disabled}
                                    >
                                      {dropdownStatus}
                                    </button>
                                  )}
                                </Menu.Item>
                              ))}
                            </div>
                          </Menu.Items>
                        </Transition>
                      </Menu>
                    </TableCell>
                    <TableCell>
                      {item.tickets === "None" ? (
                        <span className="text-muted-foreground">None</span>
                      ) : (
                        <Badge variant="outline">{item.tickets}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* 8. Add Pagination Controls */}
            {!loading && !error && totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({totalControls} total
                  controls)
                </span>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
            {/* --- End Pagination Controls --- */}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AIControlAssessment;
