
function renderEditorEl(index) {
  // choose one
  let s = localStorage.getItem(SAR_EDITOR);

  // if index is undefined, fall back to old behavior (apply to all)
  if (index === undefined) {
    if (s === 'codemirror') {
      renderCodeMirror();
    } else if (s === 'monaco') {
      document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {
        ta.classList.remove('monaco');
        ta.classList.add('monaco');
      });
      renderMonaco();
    } else {
      document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {
        ta.classList.remove('monaco');
      });
    }
    return;
  }

  // apply only to the element at index
  const li = scriptsList.querySelector(`li[data-index="${index}"]`);
  if (!li) return;

  const ta = li.querySelector('textarea.code');
  if (!ta) return;

  if (s === 'codemirror') {
    renderCodeMirrorEl(index); // pass target textarea if your function supports it
  } else if (s === 'monaco') {
    ta.classList.remove('monaco');
    ta.classList.add('monaco');
    renderMonacoEl(index); // likewise, adapt if needed
  } else {
    ta.classList.remove('monaco');
  }
}

function setBtnsTooltipsEl(index) {
  // if no index provided → apply globally (old behavior)
  if (index === undefined) {
    document.querySelectorAll('.sra-script__btn.download').forEach((el) => {
      el.title = '[Click] to download script\n[Shift+Click] to export all data';
    });
    document.querySelectorAll('.sra-script__btn.remove').forEach((el) => {
      el.title = '[Click] to delete\n[Shift+Click] to delete without confirm\n[Ctrl+Shift+Click] to delete all';
    });
    return;
  }

  // apply only to a single script item
  const li = scriptsList.querySelector(`li[data-index="${index}"]`);
  if (!li) return;

  const downloadBtn = li.querySelector('.sra-script__btn.download');
  if (downloadBtn) {
    downloadBtn.title = '[Click] to download script\n[Shift+Click] to export all data';
  }

  const removeBtn = li.querySelector('.sra-script__btn.remove');
  if (removeBtn) {
    removeBtn.title = '[Click] to delete\n[Shift+Click] to delete without confirm\n[Ctrl+Shift+Click] to delete all';
  }
}

