import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

// Elements
const fileInput = document.getElementById('file-input');
const selectedFileLabel = document.getElementById('selected-file-label');
const btnUpload = document.getElementById('btn-upload');
const uploadStatus = document.getElementById('upload-status');
const docsLoadedBox = document.getElementById('docs-loaded');
const activeDocName = document.getElementById('active-doc-name');

const questionForm = document.getElementById('question-form');
const questionInput = document.getElementById('question-input');
const btnAsk = document.getElementById('btn-ask');
const answersContainer = document.getElementById('answers-container');

let selectedFile = null;
let activeDocumentId = null;

// ==========================================================================
// 1. Document Upload
// ==========================================================================
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    selectedFile = fileInput.files[0];
    selectedFileLabel.textContent = selectedFile.name;
    btnUpload.disabled = false;
    uploadStatus.textContent = '';
    uploadStatus.className = 'upload-status';
  }
});

btnUpload.addEventListener('click', async () => {
  if (!selectedFile) return;

  btnUpload.disabled = true;
  uploadStatus.textContent = `Uploading and indexing "${selectedFile.name}"...`;
  uploadStatus.className = 'upload-status loading';

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (res.ok && data.success) {
      uploadStatus.textContent = `✓ Uploaded "${selectedFile.name}" (${data.document.totalChunks} chunks ready)`;
      uploadStatus.className = 'upload-status success';
      activeDocumentId = data.document.id;
      setActiveDocLabel(data.document.filename);

      // Reset file input
      selectedFile = null;
      fileInput.value = '';
      selectedFileLabel.textContent = 'No file selected';
    } else {
      uploadStatus.textContent = `Upload failed: ${data.error || 'Server error'}`;
      uploadStatus.className = 'upload-status error';
      btnUpload.disabled = false;
    }
  } catch (err) {
    uploadStatus.textContent = `Error: ${err.message}`;
    uploadStatus.className = 'upload-status error';
    btnUpload.disabled = false;
  }
});

function setActiveDocLabel(name) {
  docsLoadedBox.style.display = 'flex';
  activeDocName.textContent = name;
}

// Check existing documents on startup
async function loadExistingDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    if (data.success && data.documents.length > 0) {
      const latest = data.documents[0];
      activeDocumentId = latest.id;
      setActiveDocLabel(latest.filename);
    }
  } catch (err) {
    console.warn('Could not check existing documents:', err);
  }
}

// ==========================================================================
// 2. Question & Answer
// ==========================================================================
questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = questionInput.value.trim();
  if (!query) return;

  questionInput.value = '';
  btnAsk.disabled = true;

  // Remove previous question and answer
  answersContainer.innerHTML = '';

  // Create single QA Card with loading indicator
  const qaCard = document.createElement('div');
  qaCard.className = 'qa-item';
  qaCard.innerHTML = `
    <div class="qa-question">Q: ${escapeHtml(query)}</div>
    <div class="qa-answer" id="answer-content">
      <div class="qa-loading">
        <span class="spinner"></span> Searching document...
      </div>
    </div>
  `;

  answersContainer.appendChild(qaCard);

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        documentId: activeDocumentId || null,
        topK: 6,
      }),
    });

    const data = await res.json();
    const answerEl = qaCard.querySelector('#answer-content');

    if (res.ok && data.success) {
      // Display only the direct answer
      answerEl.innerHTML = marked.parse(data.answer);
    } else {
      answerEl.innerHTML = `<span style="color: #f87171;">Error: ${escapeHtml(data.error || 'Could not retrieve answer')}</span>`;
    }
  } catch (err) {
    qaCard.querySelector('#answer-content').innerHTML = `
      <span style="color: #f87171;">Network Error: ${escapeHtml(err.message)}</span>
    `;
  } finally {
    btnAsk.disabled = false;
    questionInput.focus();
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

loadExistingDocuments();
