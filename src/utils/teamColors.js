/**
 * teamColors.js
 *
 * Per-team color palette for the Instagram Hero Summary slide (Slide 4).
 * Each team has:
 *   primary   — the accent/glow color (brighter of the two palette colors)
 *   secondary — the background base color (darker, gives the card its mood)
 *
 * Fallback for unmapped teams: Maximus brand blue/navy.
 */

const TEAM_COLORS = {
  // ── Big Ten ──────────────────────────────────────────────────────────────
  'michigan-wolverines':        { primary: '#FFCB05', secondary: '#00274C' },
  'purdue-boilermakers':        { primary: '#CFB991', secondary: '#1a1108' },
  'illinois-fighting-illini':   { primary: '#E84A27', secondary: '#13294B' },
  'nebraska-cornhuskers':       { primary: '#D00000', secondary: '#1a0000' },
  'michigan-state-spartans':    { primary: '#18C96B', secondary: '#18453B' },
  'wisconsin-badgers':          { primary: '#C5050C', secondary: '#1a0000' },
  'iowa-hawkeyes':              { primary: '#FFCD00', secondary: '#0c0c00' },
  'indiana-hoosiers':           { primary: '#990000', secondary: '#1a0000' },
  'ohio-state-buckeyes':        { primary: '#BB0000', secondary: '#1a0000' },
  'ucla-bruins':                { primary: '#FFB300', secondary: '#2D68C4' },
  'usc-trojans':                { primary: '#FFC72C', secondary: '#9D2235' },
  'washington-huskies':         { primary: '#B7A57A', secondary: '#4B2E83' },
  'minnesota-golden-gophers':   { primary: '#FFB71B', secondary: '#7A0019' },
  'penn-state-nittany-lions':   { primary: '#5B92E5', secondary: '#041E42' },
  'rutgers-scarlet-knights':    { primary: '#CC0033', secondary: '#1a0007' },
  'maryland-terrapins':         { primary: '#FFD520', secondary: '#E03A3E' },
  'northwestern-wildcats':      { primary: '#9B72CF', secondary: '#4E2A84' },

  // ── SEC ──────────────────────────────────────────────────────────────────
  'florida-gators':             { primary: '#FA4616', secondary: '#0021A5' },
  'vanderbilt-commodores':      { primary: '#CFB991', secondary: '#1a1108' },
  'alabama-crimson-tide':       { primary: '#9E1B32', secondary: '#1a0003' },
  'arkansas-razorbacks':        { primary: '#9D2235', secondary: '#1a0003' },
  'tennessee-volunteers':       { primary: '#FF8200', secondary: '#1a0900' },
  'kentucky-wildcats':          { primary: '#5B8EDD', secondary: '#0033A0' },
  'georgia-bulldogs':           { primary: '#BA0C2F', secondary: '#1a0007' },
  'texas-longhorns':            { primary: '#BF5700', secondary: '#1a0800' },
  'texas-am-aggies':            { primary: '#8B3A52', secondary: '#500000' },
  'auburn-tigers':              { primary: '#E87722', secondary: '#0C2340' },
  'missouri-tigers':            { primary: '#F1B82D', secondary: '#160d00' },
  'oklahoma-sooners':           { primary: '#C8102E', secondary: '#841617' },
  'lsu-tigers':                 { primary: '#FDD023', secondary: '#461D7C' },
  'ole-miss-rebels':            { primary: '#CE1126', secondary: '#14213D' },
  'mississippi-state-bulldogs': { primary: '#660000', secondary: '#5D1725' },
  'south-carolina-gamecocks':   { primary: '#73000A', secondary: '#1a0003' },

  // ── ACC ──────────────────────────────────────────────────────────────────
  'duke-blue-devils':           { primary: '#4A8FE7', secondary: '#003087' },
  'virginia-cavaliers':         { primary: '#E57200', secondary: '#232D4B' },
  'louisville-cardinals':       { primary: '#AD0000', secondary: '#1a0000' },
  'north-carolina-tar-heels':   { primary: '#4B9CD3', secondary: '#13294B' },
  'nc-state-wolfpack':          { primary: '#CC0000', secondary: '#1a0000' },
  'clemson-tigers':             { primary: '#F66733', secondary: '#522D80' },
  'miami-hurricanes':           { primary: '#F47321', secondary: '#005030' },
  'smu-mustangs':               { primary: '#5599DD', secondary: '#0057A7' },
  'virginia-tech-hokies':       { primary: '#E5751F', secondary: '#861F41' },
  'california-golden-bears':    { primary: '#FDB515', secondary: '#003262' },
  'stanford-cardinal':          { primary: '#C84B31', secondary: '#8C1515' },
  'wake-forest-demon-deacons':  { primary: '#CEB888', secondary: '#1a1107' },
  'syracuse-orange':            { primary: '#D44500', secondary: '#1a0800' },
  'boston-college-eagles':      { primary: '#CC0000', secondary: '#1a2540' },
  'georgia-tech-yellow-jackets':{ primary: '#B3A369', secondary: '#003057' },
  'notre-dame-fighting-irish':  { primary: '#C99700', secondary: '#0C2340' },
  'pitt-panthers':              { primary: '#FFB81C', secondary: '#003594' },

  // ── Big 12 ───────────────────────────────────────────────────────────────
  'arizona-wildcats':           { primary: '#CC0033', secondary: '#003366' },
  'houston-cougars':            { primary: '#C8102E', secondary: '#1a0007' },
  'iowa-state-cyclones':        { primary: '#F1BE48', secondary: '#C8102E' },
  'kansas-jayhawks':            { primary: '#0051A5', secondary: '#1a0007' },
  'texas-tech-red-raiders':     { primary: '#CC0000', secondary: '#1a0000' },
  'byu-cougars':                { primary: '#5B8EDD', secondary: '#002E5D' },
  'ucf-knights':                { primary: '#BA9B37', secondary: '#000000' },
  'tcu-horned-frogs':           { primary: '#A070D4', secondary: '#4D1979' },
  'west-virginia-mountaineers': { primary: '#EAAA00', secondary: '#002855' },
  'arizona-state-sun-devils':   { primary: '#FFC627', secondary: '#8C1D40' },
  'cincinnati-bearcats':        { primary: '#E00122', secondary: '#1a0007' },
  'oklahoma-state-cowboys':     { primary: '#FF6600', secondary: '#1a0d00' },
  'baylor-bears':               { primary: '#FFB81C', secondary: '#1B4332' },
  'kansas-state-wildcats':      { primary: '#9B72CF', secondary: '#512888' },
  'colorado-buffaloes':         { primary: '#CFB87C', secondary: '#1a1108' },

  // ── Big East ─────────────────────────────────────────────────────────────
  'uconn-huskies':              { primary: '#6AABDD', secondary: '#000E2F' },
  'st-johns-red-storm':         { primary: '#CC1122', secondary: '#1a0005' },
  'villanova-wildcats':         { primary: '#5B8EDD', secondary: '#003082' },
  'seton-hall-pirates':         { primary: '#4A80D4', secondary: '#004488' },
  'creighton-bluejays':         { primary: '#005CA9', secondary: '#001a36' },
  'marquette-golden-eagles':    { primary: '#FACC3D', secondary: '#1a1107' },
  'georgetown-hoyas':           { primary: '#6699CC', secondary: '#041E42' },
  'xavier-musketeers':          { primary: '#9E7E38', secondary: '#0C2340' },
  'depaul-blue-demons':         { primary: '#5B8EDD', secondary: '#00305B' },
  'butler-bulldogs':            { primary: '#92847A', secondary: '#1a1108' },
  'providence-friars':          { primary: '#002147', secondary: '#001020' },

  // ── Others ───────────────────────────────────────────────────────────────
  'gonzaga-bulldogs':           { primary: '#CC0033', secondary: '#04113B' },
  'utah-state-aggies':          { primary: '#0F2439', secondary: '#1a2a3a' },
  'saint-louis-billikens':      { primary: '#002147', secondary: '#001020' },
  'saint-marys-gaels':          { primary: '#CC0000', secondary: '#00205B' },
  'miami-ohio-redhawks':        { primary: '#C3142D', secondary: '#1a0007' },
  'santa-clara-broncos':        { primary: '#862633', secondary: '#001a36' },
  'new-mexico-lobos':           { primary: '#BA0C2F', secondary: '#63666A' },
  'san-diego-state-aztecs':     { primary: '#C41230', secondary: '#1a0007' },
  'vcu-rams':                   { primary: '#F6BE00', secondary: '#000000' },
  'belmont-bruins':             { primary: '#BA0C2F', secondary: '#1a0005' },
  'south-florida-bulls':        { primary: '#006747', secondary: '#001a12' },
  'boise-state-broncos':        { primary: '#D64309', secondary: '#0033A0' },
  'grand-canyon-lopes':         { primary: '#522398', secondary: '#1a0933' },
  'nevada-wolf-pack':           { primary: '#003366', secondary: '#001a36' },
  'tulsa-golden-hurricane':     { primary: '#002D62', secondary: '#001a36' },
  'liberty-flames':             { primary: '#002868', secondary: '#B22222' },
  'dayton-flyers':              { primary: '#CC0000', secondary: '#001a36' },
  'mcneese-cowboys':            { primary: '#005EB8', secondary: '#FFC72C' },
  'loyola-chicago-ramblers':    { primary: '#862633', secondary: '#001a36' },
  'ohio-bobcats':               { primary: '#00694E', secondary: '#001a12' },
};

const FALLBACK = { primary: '#4A90D9', secondary: '#071422' };

/**
 * Get primary and secondary colors for a team by slug.
 * Falls back to Maximus brand blue/navy for unmapped teams.
 */
export function getTeamColors(slug) {
  if (!slug) return FALLBACK;
  // Direct lookup
  if (TEAM_COLORS[slug]) return TEAM_COLORS[slug];
  // Partial slug match (handles edge cases like slug variations)
  const key = Object.keys(TEAM_COLORS).find(k => slug.includes(k) || k.includes(slug));
  return key ? TEAM_COLORS[key] : FALLBACK;
}
