/**
 * Make HTML tables sortable by clicking column headers
 * Supports both numeric and text sorting with automatic detection
 */
function initTableSort() {
  const getCellValue = (tr, idx) => tr.children[idx].innerText || tr.children[idx].textContent;

  const comparer = (idx, asc) => (a, b) => {
    const v1 = getCellValue(asc ? a : b, idx);
    const v2 = getCellValue(asc ? b : a, idx);

    // Numeric comparison if both values are numbers
    if (v1 !== '' && v2 !== '' && !isNaN(v1) && !isNaN(v2)) {
      return v1 - v2;
    }

    // String comparison
    return v1.toString().localeCompare(v2);
  };

  // Add click handlers to all table headers
  document.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', function() {
      const table = th.closest('table');
      const idx = Array.from(th.parentNode.children).indexOf(th);

      // Toggle sort direction
      const asc = !this.asc;
      this.asc = asc;

      // Sort and re-append rows
      Array.from(table.querySelectorAll('tr:nth-child(n+2)'))
        .sort(comparer(idx, asc))
        .forEach(tr => table.appendChild(tr));
    });
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTableSort);
} else {
  initTableSort();
}
