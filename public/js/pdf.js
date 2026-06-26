/**
 * pdf.js — Client-side PDF export using html2canvas + jsPDF.
 * Exports the rendered report page as a multi-page PDF.
 */

window.exportReportPDF = async function() {
  const btn = document.getElementById('nav-export-pdf');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating PDF…'; }

  // Hide UI elements that shouldn't appear in PDF
  const hideEls = ['#nav-actions', '#signup-banner'];
  const hidden = hideEls.map(sel => {
    const el = document.querySelector(sel);
    if (el) { el.style.display = 'none'; }
    return el;
  });

  try {
    const { jsPDF } = window.jspdf;
    const content   = document.getElementById('report-content');

    // A4 dimensions in mm
    const pdfW = 210, pdfH = 297;

    // Capture at 2x resolution for crisp output
    const canvas = await html2canvas(content, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#030712', // dark-950
      logging: false,
    });

    const imgW   = canvas.width;
    const imgH   = canvas.height;
    const ratio  = imgW / imgH;

    // Convert canvas px to mm for PDF
    const pdfImgW = pdfW;
    const pdfImgH = pdfW / ratio;

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // If content fits in one page
    if (pdfImgH <= pdfH) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfImgW, pdfImgH);
    } else {
      // Multi-page: slice canvas into page-height segments
      const pageHeightPx = Math.floor((imgW * pdfH) / pdfW);
      let yOffset = 0;
      let pageNum = 0;

      while (yOffset < imgH) {
        const sliceH = Math.min(pageHeightPx, imgH - yOffset);
        const pageCanvas  = document.createElement('canvas');
        pageCanvas.width  = imgW;
        pageCanvas.height = sliceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, yOffset, imgW, sliceH, 0, 0, imgW, sliceH);

        if (pageNum > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfImgW, (sliceH / imgW) * pdfW);

        yOffset += sliceH;
        pageNum++;
      }
    }

    // Filename: launchshield-report-domain-YYYY-MM-DD.pdf
    let domain = 'report';
    try {
      const scan = JSON.parse(sessionStorage.getItem('launchshield_scan') || '{}');
      domain = new URL(scan.url || '').hostname.replace('www.', '');
    } catch { /* ignore */ }
    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`launchshield-report-${domain}-${date}.pdf`);

  } catch (err) {
    console.error('PDF export failed:', err);
    alert('PDF export failed. Please try again.');
  } finally {
    // Restore hidden elements
    hidden.forEach(el => { if (el) el.style.display = ''; });
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export PDF'; }
  }
};
