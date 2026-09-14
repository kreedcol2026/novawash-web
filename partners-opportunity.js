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
const interestCopy = {
  crowdfunding: {
    kicker: 'HABLEMOS DE TU INVERSIÓN',
    lead: 'Agenda una llamada para conocer el modelo de crowdfunding NovaWash y el escenario de rentabilidad anual aproximada.'
  },
  franquicia: {
    kicker: 'HABLEMOS DE TU FRANQUICIA',
    lead: 'Agenda una llamada para conocer la inversión, el montaje y el acompañamiento para abrir tu propio lavadero NovaWash.'
  }
};
const bookingKicker = document.getElementById('bookingKicker');
const bookingLead = document.getElementById('bookingLead');
document.querySelectorAll('[data-interest]').forEach(link => link.addEventListener('click', () => {
  const interest = interestCopy[link.dataset.interest];
  if (!interest || !bookingKicker || !bookingLead) return;
  bookingKicker.textContent = interest.kicker;
  bookingLead.textContent = interest.lead;
}));
// Mantener útiles los enlaces antiguos al simulador sin publicar cifras operativas.
if (location.hash === '#simulador') location.replace('#oportunidad');
