import ControlAssessment from "../models/ControlAssessment.js";
import Risks from "../models/Risks.js";

/**
 * Normalizes a raw "control" object from an agent into the database schema shape.
 * This function is defensive and ensures data integrity.
 * - Trims whitespace and provides sensible defaults.
 * - Intelligently handles 'relatedRisks' by checking multiple possible keys and
 * coercing the final value into a single, required string.
 * @param {object} raw - The raw control object from the agent.
 * @param {string} createdBy - The ID of the user creating the control.
 * @param {string} projectId - The ID of the associated project.
 * @returns {object} A clean, normalized control object ready for the database.
 */
function normalizeControl(raw, createdBy, projectId) {
  // Coerce all potential string fields to ensure type safety and remove whitespace
  const code = (raw.code ?? "").toString().trim();
  const section = (raw.section ?? "").toString().trim();
  const control = (raw.control ?? "").toString().trim();
  const requirements = (raw.requirements ?? "").toString().trim();
  const status = (raw.status ?? "Not Implemented").toString().trim() || "Not Implemented";
  const tickets = (raw.tickets ?? "None").toString().trim() || "None";

  // Intelligently find the related risk ID from multiple possible keys
  let relatedRisks = raw.relatedRisks ?? raw.related_risks ?? raw.related_risk ?? raw.risk_assessment_id;

  // If the source provided an array, safely take the first element.
  if (Array.isArray(relatedRisks)) {
    relatedRisks = relatedRisks.length > 0 ? relatedRisks[0] : "";
  }

  // Final coercion to a string to prevent validation errors.
  relatedRisks = (relatedRisks ?? "").toString().trim();

  return {
    owner: createdBy,
    code,
    section,
    control,
    requirements,
    status,
    tickets,
    projectId: projectId ? String(projectId) : undefined,
    relatedRisks, // Guaranteed to be a string
    isActive: true, // Default to active on creation
  };
}

class ControlMatrixService {
  /**
   * Stores a batch of new controls after normalizing them.
   * @param {Array} parsedControls - The array of raw control objects from the agent.
   * @param {string} createdBy - The ID of the user creating the controls.
   * @param {string} projectId - The ID of the project these controls belong to.
   * @returns {Promise<Object>} An object with the count and details of created controls.
   */
  static async storeControls(parsedControls, createdBy, projectId) {
    if (!Array.isArray(parsedControls) || parsedControls.length === 0) {
      return { controlsCount: 0, controls: [] };
    }

    const docs = parsedControls.map((raw) => normalizeControl(raw, createdBy, projectId));

    // Final validation to ensure no control has an empty 'relatedRisks' field
    const invalidDoc = docs.find((d) => !d.relatedRisks);
    if (invalidDoc) {
      throw new Error("ControlAssessment validation failed: 'relatedRisks' is required and was normalized to an empty string.");
    }

    const created = await ControlAssessment.insertMany(docs, { ordered: false });
    return {
      controlsCount: created.length,
      controls: created,
    };
  }

  /**
   * Updates a single control by its ID and triggers a governance score recalculation if the status changes.
   * @param {string} id - The MongoDB _id of the control to update.
   * @param {Object} updateData - The data to update.
   * @returns {Promise<Object>} The updated control document.
   */
  static async updateControl(id, updateData) {
    // Apply the same robust normalization to the incoming update payload
    const patch = {};
    if (updateData.code !== undefined) patch.code = String(updateData.code || "").trim();
    if (updateData.section !== undefined) patch.section = String(updateData.section || "").trim();
    if (updateData.control !== undefined) patch.control = String(updateData.control || "").trim();
    if (updateData.requirements !== undefined) patch.requirements = String(updateData.requirements || "").trim();
    if (updateData.status !== undefined) patch.status = String(updateData.status || "Not Implemented").trim() || "Not Implemented";
    if (updateData.tickets !== undefined) patch.tickets = String(updateData.tickets || "None").trim() || "None";
    if (updateData.relatedRisks !== undefined) {
      let rr = updateData.relatedRisks;
      if (Array.isArray(rr)) rr = rr[0] ?? "";
      patch.relatedRisks = String(rr || "").trim();
    }

    const updatedDoc = await ControlAssessment.findByIdAndUpdate(id, { $set: patch }, {
      new: true,
      runValidators: true,
    }).populate("owner", "name surname email");

    if (!updatedDoc) {
      throw new Error("Control not found");
    }

    // CRITICAL FEATURE: If status was updated, trigger governance score recalculation
    if (patch.status && updatedDoc.projectId) {
      try {
        const GovernanceAssessmentService = (await import('./governanceAssessmentService.js')).default;
        await GovernanceAssessmentService.recalculateGovernanceScores(updatedDoc.projectId);
        console.log(`Governance scores recalculated for project ${updatedDoc.projectId} due to control status change.`);
      } catch (error) {
        // Log the error but don't fail the entire control update operation
        console.error('Error triggering governance score recalculation:', error);
      }
    }

    // If the control just became Implemented, close its related risk.
    if (patch.status === "Implemented" && updatedDoc.relatedRisks) {
      try {
        await Risks.updateOne(
          {
            riskAssessmentId: updatedDoc.relatedRisks,
            projectId: updatedDoc.projectId,
          },
          { $set: { status: "Closed", isActive: false } }
        );
      } catch (error) {
        // Log the error but don't fail the entire control update operation
        console.error(
          `Error closing related risk ${updatedDoc.relatedRisks} for control ${updatedDoc._id}:`,
          error
        );
      }
    }

    return updatedDoc;
  }

  /**
   * Soft-deletes a control by setting its 'isActive' flag to false.
   * This preserves the record in the database for auditing purposes.
   * @param {string} id - The _id of the control to delete.
   * @returns {Promise<Object>} A confirmation object.
   */
  static async deleteControl(id) {
    const deletedDoc = await ControlAssessment.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!deletedDoc) {
      throw new Error("Control not found");
    }
    return { ok: true, message: "Control deleted successfully", deletedId: id };
  }

  /**
   * Retrieves a paginated list of all active controls.
   * @param {number} [page=1] - The page number to retrieve.
   * @param {number} [limit=20] - The number of items per page.
   * @returns {Promise<Object>} An object containing the controls and pagination details.
   */
  static async getAllControls(page = 1, limit = 20) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    // The filter to exclude soft-deleted documents
    const query = { isActive: { $ne: false } };

    const [items, total] = await Promise.all([
      ControlAssessment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("owner", "name surname email"),
      ControlAssessment.countDocuments(query),
    ]);

    return {
      controls: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  }
}

export default ControlMatrixService;
