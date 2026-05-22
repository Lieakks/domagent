var DOMAGENT_DEFAULT_HOST = '127.0.0.1';
var DOMAGENT_DEFAULT_PORT = 18792;
var DOMAGENT_DEFAULT_PATH = '/extension';
var DOMAGENT_AUTOMATION_TAB_KEY = '__daAutomationTab';

var DOMAGENT_BADGE = {
  on: { text: 'ON', color: '#FF5A36' },
  off: { text: '', color: '#000000' },
  connecting: { text: '\u2026', color: '#F59E0B' },
  error: { text: '!', color: '#B91C1C' },
};

function domAgentIsTabEligible(tab) {
  if (!tab || !tab.url || !tab.id) return false;
  var url = tab.url.toLowerCase();
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://') ||
    url.startsWith('about:blank')
  );
}
