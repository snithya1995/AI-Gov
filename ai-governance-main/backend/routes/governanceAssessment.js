import express from 'express';
import GovernanceAssessmentService from '../services/governanceAssessmentService.js';
import { authenticateToken } from '../middleware/auth.js';
import { userQuotaLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Get latest governance scores for a project
router.get('/:projectId/scores', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const scores = await GovernanceAssessmentService.getLatestGovernanceScores(projectId);
    
    if (!scores) {
      return res.status(404).json({ 
        message: 'No governance assessment found for this project',
        scores: {
          eu_score: 0,
          nist_score: 0,
          iso_score: 0,
          overall_score: 0,
          implemented_controls_count: 0,
          total_controls_count: 0
        }
      });
    }

    res.status(200).json({
      message: 'Governance scores retrieved successfully',
      scores: {
        eu_score: parseFloat(scores.euScore),
        nist_score: parseFloat(scores.nistScore),
        iso_score: parseFloat(scores.isoScore),
        overall_score: parseFloat(scores.overallScore),
        implemented_controls_count: scores.implementedControlsCount,
        total_controls_count: scores.totalControls_Count,
        assessment_date: scores.assessmentDate,
        updated_at: scores.updatedAt
      }
    });
  } catch (error) {
    console.error('Error retrieving governance scores:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve governance scores',
      message: error.message 
    });
  }
});

// Get governance score history for a project
router.get('/:projectId/history', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 10 } = req.query;
    
    const history = await GovernanceAssessmentService.getGovernanceScoreHistory(
      projectId, 
      parseInt(limit)
    );

    const formattedHistory = history.map(record => ({
      id: record.id,
      eu_score: parseFloat(record.eu_score),
      nist_score: parseFloat(record.nist_score),
      iso_score: parseFloat(record.iso_score),
      overall_score: parseFloat(record.overall_score),
      implemented_controls_count: record.implemented_controls_count,
      total_controls_count: record.total_controls_count,
      assessment_date: record.assessment_date,
      updated_at: record.updated_at
    }));

    res.status(200).json({
      message: 'Governance score history retrieved successfully',
      history: formattedHistory
    });
  } catch (error) {
    console.error('Error retrieving governance score history:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve governance score history',
      message: error.message 
    });
  }
});

// Recalculate governance scores for a project
router.post('/:projectId/recalculate', authenticateToken, userQuotaLimiter, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const updatedScores = await GovernanceAssessmentService.recalculateGovernanceScores(projectId);
    
    res.status(200).json({
      message: 'Governance scores recalculated successfully',
      scores: {
        eu_score: parseFloat(updatedScores.eu_score),
        nist_score: parseFloat(updatedScores.nist_score),
        iso_score: parseFloat(updatedScores.iso_score),
        overall_score: parseFloat(updatedScores.overall_score),
        implemented_controls_count: updatedScores.implemented_controls_count,
        total_controls_count: updatedScores.total_controls_count,
        assessment_date: updatedScores.assessment_date,
        updated_at: updatedScores.updated_at
      }
    });
  } catch (error) {
    console.error('Error recalculating governance scores:', error);
    res.status(500).json({ 
      error: 'Failed to recalculate governance scores',
      message: error.message 
    });
  }
});

// Store governance assessment scores (typically called by governance agent)
router.post('/:projectId/scores', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { 
      eu_score, 
      nist_score, 
      iso_score, 
      overall_score,
      implemented_controls_count,
      total_controls_count 
    } = req.body;

    const scores = {
      eu_score: eu_score || 0,
      nist_score: nist_score || 0,
      iso_score: iso_score || 0,
      overall_score: overall_score || 0
    };

    const storedScores = await GovernanceAssessmentService.storeGovernanceScores(
      projectId,
      scores,
      implemented_controls_count || 0,
      total_controls_count || 0
    );

    res.status(201).json({
      message: 'Governance scores stored successfully',
      scores: {
        eu_score: parseFloat(storedScores.eu_score),
        nist_score: parseFloat(storedScores.nist_score),
        iso_score: parseFloat(storedScores.iso_score),
        overall_score: parseFloat(storedScores.overall_score),
        implemented_controls_count: storedScores.implemented_controls_count,
        total_controls_count: storedScores.total_controls_count,
        assessment_date: storedScores.assessment_date,
        updated_at: storedScores.updated_at
      }
    });
  } catch (error) {
    console.error('Error storing governance scores:', error);
    res.status(500).json({ 
      error: 'Failed to store governance scores',
      message: error.message 
    });
  }
});

// Get governance statistics across all projects
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const statistics = await GovernanceAssessmentService.getGovernanceStatistics();
    
    res.status(200).json({
      message: 'Governance statistics retrieved successfully',
      statistics: {
        total_projects_assessed: parseInt(statistics.total_projects_assessed || 0),
        average_overall_score: parseFloat(statistics.average_overall_score || 0),
        average_eu_score: parseFloat(statistics.average_eu_score || 0),
        average_nist_score: parseFloat(statistics.average_nist_score || 0),
        average_iso_score: parseFloat(statistics.average_iso_score || 0),
        average_implementation_ratio: parseFloat(statistics.average_implementation_ratio || 0)
      }
    });
  } catch (error) {
    console.error('Error retrieving governance statistics:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve governance statistics',
      message: error.message 
    });
  }
});

export default router;
