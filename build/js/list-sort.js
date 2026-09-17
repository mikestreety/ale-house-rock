/**
 * Make a beer <ul class="list"> sortable by clicking a "Sort by" button,
 * reordering the <li> elements by a numeric data attribute (data-number or
 * data-rating). The first click on a button sorts descending (newest date /
 * highest rating first); each subsequent click toggles the direction.
 */
function initListSort() {
  const buttons = document.querySelectorAll('.listSort [data-sort]');

  buttons.forEach(button => {
    button.addEventListener('click', function() {
      const list = document.getElementById('beerList');
      if (!list) return;

      const attribute = `data-${this.dataset.sort}`;
      const asc = this.asc === undefined ? false : !this.asc;
      this.asc = asc;

      buttons.forEach(btn => btn.classList.remove('asc', 'desc'));
      this.classList.add(asc ? 'asc' : 'desc');

      Array.from(list.querySelectorAll('li'))
        .sort((a, b) => {
          const v1 = Number(asc ? a.getAttribute(attribute) : b.getAttribute(attribute));
          const v2 = Number(asc ? b.getAttribute(attribute) : a.getAttribute(attribute));
          return v1 - v2;
        })
        .forEach(li => list.appendChild(li));
    });
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initListSort);
} else {
  initListSort();
}
