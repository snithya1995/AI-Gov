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
} from "lucide-react"; // 1. Added pagination icons

// Import Combobox components
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

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

import controlService from "@/services/controlService";

import { Menu, Transition } from "@headlessui/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "Implemented", label: "Implemented" },
  { value: "In Progress", label: "In Progress" },
  { value: "Not Implemented", label: "Not Implemented" },
];

const dropdownStatusOptions = ["Implemented", "In Progress", "Not Implemented"];

const getStatusBadge = (status) => {
  const statusClasses = {
    Implemented: "bg-green-600 text-white hover:bg-green-700",
    "In Progress": "bg-yellow-600 text-white hover:bg-yellow-700",
    "Not Implemented": "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <Badge
      className={
        statusClasses[status] || "bg-secondary text-secondary-foreground"
      }
    >
      {status}
    </Badge>
  );
};

const ControlAssessment = () => {
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

  // Corrected useEffect to fetch all controls, then filter
  useEffect(() => {
    const fetchControls = async () => {
      setLoading(true);
      setError("");
      try {
        // 1. Fetch ALL controls (or a large number) to build a complete project list
        const result = await controlService.getControlsBySystemType(
          "cybersecurity",
          { page: 1, limit: 1000 } // Fetch large list
        );
        let allControls = result.controls || [];

        // 2. Build the complete project list from the full dataset
        const uniqueProjects = [
          ...new Map(
            allControls
              .filter((c) => c.projectId) // Ensure projectId exists
              .map((c) => [
                c.projectId,
                { projectId: c.projectId, name: c.projectId },
              ])
          ).values(),
        ];
        setProjects(uniqueProjects);

        // 3. Filter this full list locally based on the current state
        let filteredControls = allControls;
        if (status !== "all") {
          filteredControls = filteredControls.filter(
            (c) => c.status === status
          );
        }
        if (selectedProjectId !== "all") {
          filteredControls = filteredControls.filter(
            (c) => c.projectId === selectedProjectId
          );
        }

        // 4. Set the *filtered* controls for display
        setControls(filteredControls);
      } catch (e) {
        setError(e.message || "Failed to load controls");
        setControls([]);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };
    fetchControls();
  }, [status, selectedProjectId]); // Re-run when filters change

  // Create derived lists for recent and all other projects
  const { recentProjects, allOtherProjects } = useMemo(() => {
    const recents = projects.slice(0, 4);
    const others = projects.slice(4);
    return { recentProjects: recents, allOtherProjects: others };
  }, [projects]);

  const handleStatusChange = (controlId, newStatus) => {
    const previousStatus = controls.find((c) => c._id === controlId)?.status;
    setControls((prev) =>
      prev.map((c) => (c._id === controlId ? { ...c, status: newStatus } : c))
    );
    controlService
      .updateControl(controlId, { status: newStatus })
      .catch((err) => {
        console.error(`Failed to update control ${controlId}:`, err);
        // Roll back the optimistic update so the UI matches what's actually persisted
        setControls((prev) =>
          prev.map((c) =>
            c._id === controlId ? { ...c, status: previousStatus } : c
          )
        );
        window.showNotification?.(
          "error",
          "Status update failed",
          err.response?.data?.error || "Could not save the new status. Please try again."
        );
      });
  };

  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      // Fetch all controls for export, ignoring filters
      const response = await controlService.getControlsBySystemType(
        "cybersecurity",
        { limit: 1000 }
      );
      const allControls = response.controls || [];

      if (format === "excel") {
        const dataToExport = allControls.map((c) => ({
          Code: c.code,
          Section: c.section,
          Control: c.control,
          Requirements: c.requirements,
          "Risk Associated": c.relatedRisks,
          Status: c.status,
          Tickets: c.tickets,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          "Cybersecurity Controls"
        );
        XLSX.writeFile(workbook, "Cybersecurity_Controls_Export.xlsx");
      } else if (format === "pdf") {
        const doc = new jsPDF();
        doc.text("Cybersecurity Controls Assessment Report", 14, 16);
        const tableColumn = ["Code", "Control", "Risk Associated", "Status"];
        const tableRows = allControls.map((c) => [
          c.code,
          c.control,
          c.relatedRisks || "N/A",
          c.status,
        ]);
        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 20 });
        doc.save("Cybersecurity_Controls_Export.pdf");
      }
    } catch (err) {
      console.error(`Failed to export to ${format}:`, err);
    } finally {
      setIsExporting(false);
    }
  };

  // 4. Add Pagination Logic
  const totalControls = controls.length;
  const totalPages = Math.ceil(totalControls / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedControls = controls.slice(
    startIndex,
    startIndex + itemsPerPage
  );

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
          <span>Cybersecurity Controls Assessment</span>
          <div className="flex flex-wrap gap-2 z-10">
            {" "}
            {/* Added z-10 for context */}
            <Menu as="div" className="relative inline-block text-left">
              <Menu.Button
                as={Button}
                variant="outline"
                className="w-[150px] h-10"
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
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-popover p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  {" "}
                  {/* Increased z-index */}
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => handleExport("excel")}
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
                          onClick={() => handleExport("pdf")}
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
            {/* 7. REPLACE the old project <Select> with this new <Popover> Combobox */}
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[200px] h-10">
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
            {/* Status Filter */}
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px] h-10">
                <SelectValue placeholder="All Statuses" />
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
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">
            Loading controls…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-destructive">{error}</div>
        ) : controls.length === 0 ? ( // 5. Check original list length for "no results"
          <div className="p-6 text-center text-muted-foreground">
            No controls found for the selected filters.
          </div>
        ) : (
          <>
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
                {/* 6. Map over the paginated list */}
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
                          <Menu.Items className="absolute right-0 mt-2 w-40 origin-top-right rounded-md bg-popover p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                            {" "}
                            {/* Increased z-index */}
                            <div className="px-1 py-1">
                              {dropdownStatusOptions.map((s) => (
                                <Menu.Item key={s} disabled={item.status === s}>
                                  {({ active, disabled }) => (
                                    <button
                                      onClick={() =>
                                        handleStatusChange(item._id, s)
                                      }
                                      className={cn(
                                        "group flex w-full items-center rounded-md px-2 py-2 text-sm text-left",
                                        active && "bg-secondary",
                                        disabled &&
                                          "opacity-50 cursor-not-allowed"
                                      )}
                                      disabled={disabled}
                                    >
                                      {s}
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

            {/* 7. Add Pagination Controls */}
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

export default ControlAssessment;
