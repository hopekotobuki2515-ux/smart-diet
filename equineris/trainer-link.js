'use strict';
(() => {
  const path = location.pathname.split('/').pop();
  const stage = {'record.html':'1','diary-step2.html':'2','diary-step3.html':'3'}[path];
  if (!stage) return;
  const metricLink=document.querySelector('a[href="./measurements.html"]');
  if (!metricLink || document.getElementById('trainerReviewEntry')) return;
  const syncHref = (link) => {
    const params=new URLSearchParams({stage});
    const field=document.getElementById('diary-date');
    const selectedDate=field && /^\d{4}-\d{2}-\d{2}$/.test(field.value)?field.value:'';
    const incoming=new URLSearchParams(location.search);
    if (selectedDate) params.set('date',selectedDate);
    else if (/^[123]$/.test(incoming.get('day')||'')) params.set('day',incoming.get('day'));
    else if (/^\d{4}-\d{2}-\d{2}$/.test(incoming.get('date')||'')) params.set('date',incoming.get('date'));
    link.href='./trainer-check.html?'+params.toString();
  };
  // A public GitHub Pages deployment must never display a nonworking upload control.
  fetch('./api/review.php?action=status',{cache:'no-store',credentials:'same-origin'})
    .then(response=>{if(!response.ok)throw Error('Unavailable');return response.json()})
    .then(status=>{
      if(!status.configured)return;
      const a=document.createElement('a');
      a.id='trainerReviewEntry';
      a.textContent='トレーナーに食事記録を確認してもらう（任意）';
      a.style.cssText='display:block;text-align:center;min-height:48px;padding:12px 8px;margin:12px 0;color:#285d4a;font-size:13px;font-weight:750;text-decoration:underline;text-underline-offset:4px';
      syncHref(a);
      a.addEventListener('click',()=>syncHref(a));
      metricLink.insertAdjacentElement('afterend',a);
    })
    .catch(()=>{ /* No Sakura backend yet: leave existing recording UI unchanged */ });
})();