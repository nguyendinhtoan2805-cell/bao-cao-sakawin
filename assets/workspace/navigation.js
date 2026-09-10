// Navigation presentation only. Existing links retain their permission-controlled nodes.
(() => {
  const nav = document.querySelector('.appnav');
  if (!nav || nav.querySelector('.nav-group')) return;
  document.body.classList.add('grouped-navigation');
  const links = [...nav.querySelectorAll('a.navtab')];
  const pathOf = link => new URL(link.href, location.href).pathname;
  const find = path => links.find(link => pathOf(link) === path);
  const allowed = link => !link.hidden && link.style.display !== 'none';
  const groups = [];
  for (const [key, label, icon, paths] of [
    ['pnl', 'PnL', 'pie-chart', ['/doanh-so.html', '/tai-chinh.html', '/quy-luong.html']],
    ['people', 'Nhân sự', 'users', ['/nhan-su.html', '/tuyen-dung.html']],
    ['marketing', 'Marketing', 'trello', ['/order.html', '/san-pham.html']]
  ]) {
    const children = paths.map(find).filter(Boolean);
    if (!children.length) continue;
    const group = document.createElement('details');
    group.className = 'nav-group';
    group.dataset.navGroup = key;
    group.hidden = true;
    const heading = document.createElement('summary');
    heading.className = 'nav-group-heading';
    heading.title = label;
    heading.setAttribute('aria-label', label);
    heading.innerHTML = '<i class="ui-icon" aria-hidden="true" style="--icon:url(/assets/recruitment/icons/' + icon + '.svg)"></i><span class="nav-label">' + label + '</span><span class="nav-chevron" aria-hidden="true"></span>';
    const items = document.createElement('div');
    items.className = 'nav-group-items';
    group.append(heading, items);
    children[0].before(group);
    for (const link of children) {
      if (pathOf(link) === '/nhan-su.html') {
        link.querySelector('.nav-label').textContent = 'Hồ sơ nhân sự';
        link.title = 'Hồ sơ nhân sự';
        link.setAttribute('aria-label', 'Hồ sơ nhân sự');
      }
      items.append(link);
    }
    const current = children.some(link => pathOf(link) === location.pathname);
    group.classList.toggle('is-current', current);
    group.open = current;
    heading.addEventListener('click', event => {
      if (document.body.classList.contains('sidebar-compact') && matchMedia('(min-width:821px)').matches) {
        event.preventDefault();
        document.querySelector('.sidebar-toggle')?.click();
        group.open = true;
      }
    });
    groups.push({group, children});
  }

  function syncVisibility() {
    for (const {group, children} of groups) group.hidden = !children.some(allowed);
  }
  const observer = new MutationObserver(syncVisibility);
  // Observe only original links; updating group visibility cannot trigger a loop.
  for (const link of links) observer.observe(link, {attributes:true, attributeFilter:['hidden', 'style']});
  syncVisibility();
})();
