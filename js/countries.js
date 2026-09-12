// ============================================================
// Daftar negara lengkap (ISO 3166-1, 249 wilayah) + bendera emoji.
// Nama dalam Bahasa Indonesia.
// ============================================================

const RAW = `AD|Andorra
AE|Uni Emirat Arab
AF|Afghanistan
AG|Antigua dan Barbuda
AI|Anguilla
AL|Albania
AM|Armenia
AO|Angola
AQ|Antarktika
AR|Argentina
AS|Samoa Amerika
AT|Austria
AU|Australia
AW|Aruba
AX|Kepulauan Aland
AZ|Azerbaijan
BA|Bosnia dan Herzegovina
BB|Barbados
BD|Bangladesh
BE|Belgia
BF|Burkina Faso
BG|Bulgaria
BH|Bahrain
BI|Burundi
BJ|Benin
BL|Saint Barthelemy
BM|Bermuda
BN|Brunei
BO|Bolivia
BQ|Bonaire
BR|Brasil
BS|Bahama
BT|Bhutan
BV|Pulau Bouvet
BW|Botswana
BY|Belarus
BZ|Belize
CA|Kanada
CC|Kepulauan Cocos
CD|Kongo (Kinshasa)
CF|Afrika Tengah
CG|Kongo (Brazzaville)
CH|Swiss
CI|Pantai Gading
CK|Kepulauan Cook
CL|Chili
CM|Kamerun
CN|China
CO|Kolombia
CR|Kosta Rika
CU|Kuba
CV|Tanjung Verde
CW|Curacao
CX|Pulau Natal
CY|Siprus
CZ|Cekia
DE|Jerman
DJ|Djibouti
DK|Denmark
DM|Dominika
DO|Republik Dominika
DZ|Aljazair
EC|Ekuador
EE|Estonia
EG|Mesir
EH|Sahara Barat
ER|Eritrea
ES|Spanyol
ET|Ethiopia
FI|Finlandia
FJ|Fiji
FK|Kepulauan Falkland
FM|Mikronesia
FO|Kepulauan Faroe
FR|Prancis
GA|Gabon
GB|Britania Raya
GD|Grenada
GE|Georgia
GF|Guyana Prancis
GG|Guernsey
GH|Ghana
GI|Gibraltar
GL|Greenland
GM|Gambia
GN|Guinea
GP|Guadeloupe
GQ|Guinea Khatulistiwa
GR|Yunani
GS|Georgia Selatan
GT|Guatemala
GU|Guam
GW|Guinea-Bissau
GY|Guyana
HK|Hong Kong
HM|Pulau Heard
HN|Honduras
HR|Kroasia
HT|Haiti
HU|Hongaria
ID|Indonesia
IE|Irlandia
IL|Israel
IM|Pulau Man
IN|India
IO|Teritori Samudra Hindia Britania
IQ|Irak
IR|Iran
IS|Islandia
IT|Italia
JE|Jersey
JM|Jamaika
JO|Yordania
JP|Jepang
KE|Kenya
KG|Kirgizstan
KH|Kamboja
KI|Kiribati
KM|Komoro
KN|Saint Kitts dan Nevis
KP|Korea Utara
KR|Korea Selatan
KW|Kuwait
KY|Kepulauan Cayman
KZ|Kazakhstan
LA|Laos
LB|Lebanon
LC|Saint Lucia
LI|Liechtenstein
LK|Sri Lanka
LR|Liberia
LS|Lesotho
LT|Lituania
LU|Luksemburg
LV|Latvia
LY|Libya
MA|Maroko
MC|Monako
MD|Moldova
ME|Montenegro
MF|Saint Martin
MG|Madagaskar
MH|Kepulauan Marshall
MK|Makedonia Utara
ML|Mali
MM|Myanmar
MN|Mongolia
MO|Makau
MP|Kepulauan Mariana Utara
MQ|Martinik
MR|Mauritania
MS|Montserrat
MT|Malta
MU|Mauritius
MV|Maladewa
MW|Malawi
MX|Meksiko
MY|Malaysia
MZ|Mozambik
NA|Namibia
NC|Kaledonia Baru
NE|Niger
NF|Pulau Norfolk
NG|Nigeria
NI|Nikaragua
NL|Belanda
NO|Norwegia
NP|Nepal
NR|Nauru
NU|Niue
NZ|Selandia Baru
OM|Oman
PA|Panama
PE|Peru
PF|Polinesia Prancis
PG|Papua Nugini
PH|Filipina
PK|Pakistan
PL|Polandia
PM|Saint Pierre dan Miquelon
PN|Kepulauan Pitcairn
PR|Puerto Riko
PS|Palestina
PT|Portugal
PW|Palau
PY|Paraguay
QA|Qatar
RE|Reunion
RO|Rumania
RS|Serbia
RU|Rusia
RW|Rwanda
SA|Arab Saudi
SB|Kepulauan Solomon
SC|Seychelles
SD|Sudan
SE|Swedia
SG|Singapura
SH|Saint Helena
SI|Slovenia
SJ|Svalbard
SK|Slovakia
SL|Sierra Leone
SM|San Marino
SN|Senegal
SO|Somalia
SR|Suriname
SS|Sudan Selatan
ST|Sao Tome dan Principe
SV|El Salvador
SX|Sint Maarten
SY|Suriah
SZ|Eswatini
TC|Kepulauan Turks dan Caicos
TD|Chad
TF|Daratan Selatan Prancis
TG|Togo
TH|Thailand
TJ|Tajikistan
TK|Tokelau
TL|Timor Leste
TM|Turkmenistan
TN|Tunisia
TO|Tonga
TR|Turki
TT|Trinidad dan Tobago
TV|Tuvalu
TW|Taiwan
TZ|Tanzania
UA|Ukraina
UG|Uganda
UM|Kepulauan Terluar AS
US|Amerika Serikat
UY|Uruguay
UZ|Uzbekistan
VA|Vatikan
VC|Saint Vincent dan Grenadine
VE|Venezuela
VG|Kepulauan Virgin Britania
VI|Kepulauan Virgin AS
VN|Vietnam
VU|Vanuatu
WF|Wallis dan Futuna
WS|Samoa
YE|Yaman
YT|Mayotte
ZA|Afrika Selatan
ZM|Zambia
ZW|Zimbabwe`;

export const COUNTRIES = RAW.trim()
  .split('\n')
  .map((line) => {
    const [code, name] = line.split('|');
    return { code: code.trim(), name: name.trim() };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'id'));

/** Bendera emoji dari kode ISO (mis. 'ID' -> 🇮🇩). */
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  const A = 127397; // regional indicator A
  return String.fromCodePoint(A + code.charCodeAt(0), A + code.charCodeAt(1));
}

export function countryByCode(code) {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code) || null;
}

/** Bendera untuk profil/seed ('🇮🇩' atau '' jika tak ada). */
export function flagFor(profile) {
  if (!profile || !profile.country) return '';
  return flagEmoji(profile.country);
}
