const express = require('express');
const router = express.Router();
const { getAllSubjects, getSubjectById } = require('../services/subjectCatalog');

router.get('/', (req, res) => {
  return res.json(getAllSubjects());
});

router.get('/:id', (req, res) => {
  const subject = getSubjectById(req.params.id);
  if (!subject) {
    return res.status(404).json({ message: 'Subject category not found' });
  }
  return res.json(subject);
});

module.exports = router;
