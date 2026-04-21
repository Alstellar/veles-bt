// Debug sidebar tracking
function debugSidebar() {
  const sectionOrder = ['cfg-static', 'cfg-entry', 'cfg-order', 'cfg-exit', 'cfg-run'];
  const scrollTop = window.scrollY;
  const viewportHeight = window.innerHeight;
  const viewportCenter = scrollTop + viewportHeight / 2;
  const scrollHeight = document.documentElement.scrollHeight;

  console.log('=== SIDEBAR DEBUG ===');
  console.log('scrollTop:', scrollTop, 'viewportHeight:', viewportHeight, 'viewportCenter:', viewportCenter);
  console.log('scrollHeight:', scrollHeight, 'isTop:', scrollTop === 0, 'isBottom:', scrollTop + viewportHeight >= scrollHeight - 10);

  sectionOrder.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const blockTop = rect.top + scrollTop;
    const blockHeight = rect.height;
    const blockCenter = blockTop + blockHeight / 2;
    const distFromCenter = Math.abs(blockTop - viewportCenter);
    const containsCenter = blockTop <= viewportCenter && blockTop + blockHeight >= viewportCenter;

    console.log(`${i}: ${id} top=${blockTop} height=${blockHeight} center=${blockCenter} dist=${distFromCenter} containsCenter=${containsCenter}`);
  });

  // Test my algorithm
  if (scrollTop === 0) {
    console.log('TOP: would select cfg-static');
  } else if (scrollTop + viewportHeight >= scrollHeight - 10) {
    console.log('BOTTOM: would select cfg-run');
  } else {
    let closestIndex = 0;
    let closestDistance = Infinity;
    sectionOrder.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      const blockTop = el.getBoundingClientRect().top + scrollTop;
      const distance = blockTop - viewportCenter;
      const absDist = Math.abs(distance);

      // Only consider if above or at center
      if (distance <= 0 && absDist < closestDistance) {
        closestDistance = absDist;
        closestIndex = i;
      }
    });
    console.log('MIDDLE: would select', sectionOrder[closestIndex]);
  }
  console.log('===================');
}

// Run on scroll
window.addEventListener('scroll', debugSidebar, { passive: true });
debugSidebar();
