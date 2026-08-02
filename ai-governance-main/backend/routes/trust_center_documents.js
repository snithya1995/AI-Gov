// routes/documents.js
import express from "express";
import { authenticateToken } from '../middleware/auth.js';
import { userQuotaLimiter } from '../middleware/rateLimit.js';
import { Storage } from "@google-cloud/storage";

const router = express.Router();

const storage = new Storage({
  keyFilename: "./service.json",
});
const bucketName = "governance-bucket";

// Schedule regular GCS sync for RAG agent
let syncInterval = null;

const startRegularSync = () => {
  if (syncInterval) return; // Already running
  
  const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
  const SYNC_INTERVAL_MINUTES = parseInt(process.env.GCS_SYNC_INTERVAL_MINUTES) || 30;
  
  console.log(`Starting regular GCS sync every ${SYNC_INTERVAL_MINUTES} minutes`);
  
  syncInterval = setInterval(async () => {
    try {
      console.log('Triggering scheduled GCS sync...');
      const response = await fetch(`${AGENT_URL}/agent/rag/sync-gcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`Scheduled sync completed: ${result.files_indexed} files indexed, ${result.chunks_added} chunks added`);
      } else {
        console.error('Scheduled sync failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error during scheduled GCS sync:', error);
    }
  }, SYNC_INTERVAL_MINUTES * 60 * 1000); // Convert minutes to milliseconds
};

const stopRegularSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('Regular GCS sync stopped');
  }
};

// Start regular sync on module load
startRegularSync();

// Fallback sample documents for development
const getSampleDocuments = () => {
  const today = new Date().toISOString().split("T")[0];
  return {
    policies: [
      {
        fileName: "Privacy-Policy-2024.pdf",
        size: "250 KB",
        lastUpdated: today,
        title: "Privacy Policy 2024",
        description: "Comprehensive privacy policy covering data handling and user rights",
        category: "Legal",
        access: "Public",
        version: "v2.0",
      },
      {
        fileName: "Data-Security-Policy.pdf",
        size: "180 KB",
        lastUpdated: today,
        title: "Data Security Policy",
        description: "Security guidelines for data protection and access control",
        category: "Security",
        access: "Internal",
        version: "v1.5",
      },
    ],
    certifications: [
      {
        fileName: "ISO27001-Certification.pdf",
        size: "150 KB",
        lastUpdated: today,
        title: "ISO 27001:2022 Certification",
        description: "Information Security Management System certification",
        category: "Compliance",
        access: "Public",
        version: "v1.0",
        issuer: "International Organization for Standardization",
        validUntil: "2026-12-31",
      },
      {
        fileName: "SOC2-TypeII-Report.pdf",
        size: "320 KB",
        lastUpdated: today,
        title: "SOC 2 Type II Report",
        description: "System and Organization Controls audit report",
        category: "Audit",
        access: "Public",
        version: "v1.0",
        issuer: "AICPA",
        validUntil: "2025-06-30",
      },
    ],
    audits: [
      {
        fileName: "Annual-Security-Audit-2024.pdf",
        size: "420 KB",
        lastUpdated: today,
        title: "Annual Security Audit 2024",
        description: "Comprehensive security audit findings and recommendations",
        category: "Security",
        access: "Internal",
        version: "v1.0",
        auditor: "CyberSecure Auditors Inc.",
        date: today,
        findings: "No critical issues found",
      },
      {
        fileName: "Compliance-Assessment-2024.pdf",
        size: "280 KB",
        lastUpdated: today,
        title: "Compliance Assessment 2024",
        description: "GDPR and regulatory compliance assessment report",
        category: "Compliance",
        access: "Internal",
        version: "v1.0",
        auditor: "Compliance Solutions Ltd.",
        date: today,
        findings: "All controls operational",
      },
    ],
  };
};

// Endpoint to list and categorize all relevant documents
router.get("/api/documents", authenticateToken, async (req, res) => {
  try {
    // Try to fetch from GCS if configured
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      try {
        const [files] = await storage.bucket(bucketName).getFiles();

        // Filter: include only PDFs and exclude folder placeholders
        const pdfFiles = files.filter((file) => {
          const name = file?.name || "";
          const isFolder = name.endsWith("/");
          const contentType = file?.metadata?.contentType || "";
          const isPdfByName = name.toLowerCase().endsWith('.pdf');
          const isPdfByType = contentType.toLowerCase() === 'application/pdf';
          return !isFolder && (isPdfByName || isPdfByType);
        });

        // Create separate arrays for each document type
        const policies = [];
        const certifications = [];
        const audits = [];

        // Loop through filtered files and categorize them
        pdfFiles.forEach((file) => {
          const meta = file.metadata.metadata || {};
          const docType = meta.type || "Policy"; // Default to 'Policy' if type isn't set

          // Create a base document object with common fields
          const baseDoc = {
            fileName: file.name,
            size: `${(file.metadata.size / 1024).toFixed(1)} KB`,
            lastUpdated: new Date(file.metadata.updated)
              .toISOString()
              .split("T")[0],
            title: meta.title || file.name,
            description: meta.description || "",
            category: meta.category || "General",
            access: meta.access || "Internal",
            version: meta.version || "v1.0",
          };

          // Add the document to the correct array with its specific fields
          switch (docType) {
            case "Certification":
              certifications.push({
                ...baseDoc,
                issuer: meta.issuer || "N/A",
                validUntil: meta.validUntil || "N/A",
              });
              break;
            case "Audit":
              audits.push({
                ...baseDoc,
                auditor: meta.auditor || "N/A",
                date: meta.date || baseDoc.lastUpdated,
                findings: meta.findings || "N/A",
              });
              break;
            case "Policy":
            default:
              policies.push({
                ...baseDoc,
              });
              break;
          }
        });

        // Send the categorized lists to the frontend (PDFs only)
        return res.json({ policies, certifications, audits });
      } catch (gcsError) {
        console.warn("GCS fetch failed, using fallback sample documents:", gcsError.message);
      }
    }

    // Fallback: return sample documents for development
    console.log("Using sample documents (GCS not configured)");
    res.json(getSampleDocuments());
  } catch (error) {
    console.error("Failed to fetch documents:", error);
    res.status(500).json({ 
      error: "Error fetching documents",
      policies: [],
      certifications: [],
      audits: []
    });
  }
});

// The endpoint for signed URLs remains the same and is perfectly fine.
router.get("/api/documents/url/:fileName", async (req, res) => {
  try {
    const { fileName } = req.params;
    const options = {
      version: "v4",
      action: "read",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    };

    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl(options);

    res.json({ url });
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    res.status(500).send("Error generating file URL.");
  }
});

// Endpoint to manually trigger GCS sync
router.post("/api/documents/sync", userQuotaLimiter, async (req, res) => {
  try {
    const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
    
    console.log('Manual GCS sync triggered...');
    const response = await fetch(`${AGENT_URL}/agent/rag/sync-gcs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const result = await response.json();
      res.json({
        success: true,
        message: 'Sync completed successfully',
        files_indexed: result.files_indexed,
        chunks_added: result.chunks_added
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Sync failed',
        error: `Agent responded with status ${response.status}`
      });
    }
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: error.message
    });
  }
});

// Endpoint to get sync status
router.get("/api/documents/sync/status", async (req, res) => {
  try {
    const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
    
    const response = await fetch(`${AGENT_URL}/agent/rag/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const result = await response.json();
      res.json({
        success: true,
        indexed_file_count: result.indexed_file_count,
        sync_running: syncInterval !== null
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to get sync status',
        error: `Agent responded with status ${response.status}`
      });
    }
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: error.message
    });
  }
});

export default router;
