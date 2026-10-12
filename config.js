/* Configuración del viaje. Lo único que hay que tocar es API_URL. */
window.TRIP = {
  // URL de la aplicación web de Apps Script (termina en /exec)
  API_URL: "https://script.google.com/macros/s/AKfycbydBLTXJk4HgE3BARWy8PKOz1vGmihOhw_kbyCwJmlaIpobs-aPdUoPg61QXyL3i0T0jA/exec",
  NAME: "Córdoba 2026",
  PEOPLE: ["Javi", "Bel", "Facu", "Anto"],
  OWNER: "Anto",
  THRESHOLD: 3, // votos de "quiero ir" para pasar a la lista de espera
  BASE: { name: "Córdoba centro", lat: -31.4167, lng: -64.1836 },
  SHEET_URL: "https://docs.google.com/spreadsheets/d/1AytYWHh9TWcpQ7aGsot5cXYEHtsbOu-qM-ozHe2xva0/edit"
};
