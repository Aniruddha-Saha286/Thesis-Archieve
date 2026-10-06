const mongoose = require('mongoose');

const paperSummarySchema = new mongoose.Schema(
  {
    paperId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    doi: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    sourceContentHash: {
      type: String,
      required: true,
      index: true,
    },
    language: {
      type: String,
      enum: ['en', 'bn'],
      default: 'en',
    },
    coverage: {
      type: String,
      enum: ['full_text', 'abstract_only', 'unavailable'],
      required: true,
    },
    summary: {
      tldr: {
        type: String,
        default: '',
      },
      oneSentenceTakeaway: {
        type: String,
        default: '',
      },
      plainLanguageOverview: {
        type: String,
        default: '',
      },
      researchObjective: {
        type: String,
        default: '',
      },
      researchQuestion: {
        type: String,
        default: '',
      },
      methodology: {
        type: String,
        default: '',
      },
      studyDesignAndMethods: {
        type: String,
        default: '',
      },
      datasetSample: {
        type: String,
        default: 'Not reported',
      },
      dataOrSample: {
        type: String,
        default: 'Not reported',
      },
      mainFindings: {
        type: String,
        default: '',
      },
      keyFindings: {
        type: String,
        default: '',
      },
      mainContributions: {
        type: String,
        default: '',
      },
      limitations: {
        type: String,
        default: 'Not reported',
      },
      authorStatedLimitations: {
        type: String,
        default: 'Not reported',
      },
      inferredLimitations: {
        type: String,
        default: null,
      },
      cautiousInferredLimitations: {
        type: String,
        default: null,
      },
      futureWork: {
        type: String,
        default: '',
      },
      relevanceForThesisResearch: {
        type: String,
        default: '',
      },
      missingInformation: {
        type: String,
        default: '',
      },
      confidence: {
        type: String,
        default: 'moderate',
      },
      isAiGenerated: {
        type: Boolean,
        default: false,
      },
      generationType: {
        type: String,
        default: 'grounded_extractive',
      },
      keyTerms: [
        {
          type: String,
        },
      ],
      evidence: [
        {
          sectionOrPage: { type: String, default: '' },
          quote: { type: String, default: '' },
        },
      ],
      evidenceReferences: [
        {
          sectionOrPage: { type: String, default: '' },
          quote: { type: String, default: '' },
        },
      ],
      // Which headings were really found in the paper's text (false = placeholder only)
      found: {
        objective: { type: Boolean, default: false },
        methodology: { type: Boolean, default: false },
        dataset: { type: Boolean, default: false },
        findings: { type: Boolean, default: false },
        contributions: { type: Boolean, default: false },
        limitations: { type: Boolean, default: false },
        futureWork: { type: Boolean, default: false },
      },
      disclaimer: {
        type: String,
        default: "Sentences taken from the paper's own text by keyword rules. Not written by AI. Check the original paper.",
      },
    },
    modelVersion: {
      type: String,
      default: 'grounded-extractor-v1',
    },
    promptVersion: {
      type: String,
      default: 'v1',
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee cache deduplication
paperSummarySchema.index(
  { paperId: 1, language: 1, sourceContentHash: 1, promptVersion: 1 },
  { unique: true }
);

module.exports = mongoose.model('PaperSummary', paperSummarySchema);
