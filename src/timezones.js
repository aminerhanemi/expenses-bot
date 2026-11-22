// Countries with several zones use the main one. Names are lowercase with no accents.
const COUNTRY_TIME_ZONES = {
  argentina: 'America/Argentina/Buenos_Aires',
  belice: 'America/Belize',
  belize: 'America/Belize',
  bolivia: 'America/La_Paz',
  brasil: 'America/Sao_Paulo',
  brazil: 'America/Sao_Paulo',
  chile: 'America/Santiago',
  colombia: 'America/Bogota',
  'costa rica': 'America/Costa_Rica',
  cuba: 'America/Havana',
  'dominican republic': 'America/Santo_Domingo',
  ecuador: 'America/Guayaquil',
  'el salvador': 'America/El_Salvador',
  guatemala: 'America/Guatemala',
  guyana: 'America/Guyana',
  haiti: 'America/Port-au-Prince',
  honduras: 'America/Tegucigalpa',
  jamaica: 'America/Jamaica',
  mexico: 'America/Mexico_City',
  nicaragua: 'America/Managua',
  panama: 'America/Panama',
  paraguay: 'America/Asuncion',
  peru: 'America/Lima',
  'puerto rico': 'America/Puerto_Rico',
  'republica dominicana': 'America/Santo_Domingo',
  suriname: 'America/Paramaribo',
  uruguay: 'America/Montevideo',
  venezuela: 'America/Caracas',
};

// Returns null for a country that isn't in the list.
function timeZoneForCountry_(country) {
  const name = country.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Object.prototype.hasOwnProperty.call(COUNTRY_TIME_ZONES, name) ? COUNTRY_TIME_ZONES[name] : null;
}
