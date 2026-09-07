// Presentation only: no API, storage, account or recruitment state changes.
(() => {
  const toggle = document.querySelector('.sidebar-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const compact = document.body.classList.toggle('sidebar-compact');
    toggle.setAttribute('aria-expanded', String(!compact));
    toggle.setAttribute('aria-label', compact ? 'Mở rộng menu' : 'Thu gọn menu');
    toggle.title = compact ? 'Mở rộng menu' : 'Thu gọn menu';
  });
})();
