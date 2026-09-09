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
  let orderSource, orderMedia, orderWrapper;

  const order = find('/order.html');
  if (order) {
    orderSource = order;
    orderMedia = order.cloneNode(true);
    orderMedia.removeAttribute('id');
    orderMedia.removeAttribute('data-right');
    orderMedia.removeAttribute('aria-current');
    orderWrapper = document.createElement('div');
    orderWrapper.className = 'nav-order-links';
    orderWrapper.hidden = true;
    order.before(orderWrapper);
    for (const [link, team, label] of [[order, 'design', 'Design'], [orderMedia, 'media', 'Media']]) {
      link.href = '/order.html?team=' + team;
      link.dataset.orderTeam = team;
      link.title = label;
      link.setAttribute('aria-label', label);
      link.querySelector('.nav-label').textContent = label;
      link.classList.remove('active');
      link.removeAttribute('aria-current');
      orderWrapper.append(link);
      link.addEventListener('click', event => {
        if (location.pathname !== '/order.html' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const tab = document.getElementById(team === 'design' ? 'tabDesign' : 'tabMedia');
        if (tab) { event.preventDefault(); tab.click(); }
      });
    }
  }

  for (const [key, label, icon, paths] of [
    ['pnl', 'PnL', 'pie-chart', ['/doanh-so.html', '/tai-chinh.html', '/quy-luong.html']],
    ['people', 'Nhân sự', 'users', ['/nhan-su.html', '/tuyen-dung.html']],
    ['marketing', 'Marketing', 'trello', ['/order.html']]
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
    const first = children[0] === orderSource ? orderWrapper : children[0];
    first.before(group);
    for (const link of children) {
      if (pathOf(link) === '/nhan-su.html') {
        link.querySelector('.nav-label').textContent = 'Hồ sơ nhân sự';
        link.title = 'Hồ sơ nhân sự';
        link.setAttribute('aria-label', 'Hồ sơ nhân sự');
      }
      items.append(link === orderSource ? orderWrapper : link);
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
    if (orderSource) {
      // Both shortcuts follow the original Order link; neither grants an additional right.
      orderWrapper.hidden = !allowed(orderSource);
      orderMedia.hidden = orderSource.hidden;
      orderMedia.style.display = orderSource.style.display;
    }
    for (const {group, children} of groups) group.hidden = !children.some(allowed);
  }
  function syncOrderTeam(team) {
    if (location.pathname !== '/order.html' || !orderSource) return;
    for (const link of [orderSource, orderMedia]) {
      const current = link.dataset.orderTeam === team;
      link.classList.toggle('active', current);
      if (current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
  const observer = new MutationObserver(syncVisibility);
  // Observe only original nodes: updates to wrappers/clones cannot trigger a loop.
  for (const link of links) observer.observe(link, {attributes:true, attributeFilter:['hidden', 'style']});
  syncVisibility();
  syncOrderTeam(new URLSearchParams(location.search).get('team') === 'design' ? 'design' : 'media');
  document.addEventListener('order-team-change', event => syncOrderTeam(event.detail.team));
})();
