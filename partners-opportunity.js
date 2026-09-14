const amountButtons = document.querySelectorAll('[data-example-amount]');
const cop = new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0});
amountButtons.forEach(button => button.addEventListener('click', () => {
  const amount = Number(button.dataset.exampleAmount);
  if (![10000000,20000000,50000000].includes(amount)) return;
  amountButtons.forEach(el => el.setAttribute('aria-pressed',String(el===button)));
  document.getElementById('exampleCapital').textContent = cop.format(amount);
  document.getElementById('exampleAnnual').textContent = cop.format(amount * .28);
}));
const mobileCTA = document.querySelector('.op-mobile-cta');
const booking = document.getElementById('registro');
if (mobileCTA && booking && 'IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    mobileCTA.classList.toggle('is-hidden', entries[0].isIntersecting);
  },{threshold:0}).observe(booking);
}
// Mantener útiles los enlaces antiguos al simulador sin publicar cifras operativas.
if (location.hash === '#simulador') location.replace('#oportunidad');
