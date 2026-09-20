// The 20 streets the game asks about, in display order (the game shuffles them).
// `name` must match the OSM "name" tag in data/streets-raw.js exactly.
// `hint` is shown on the result screen so the player learns something each round.
window.STREET_LIST = [
  { name: "Coolsingel",           hint: "Rotterdam's main boulevard, home to the City Hall (Stadhuis)." },
  { name: "Witte de Withstraat",  hint: "The city's art & nightlife street, full of bars and galleries." },
  { name: "Lijnbaan",             hint: "Europe's first pedestrian shopping street, opened in 1953." },
  { name: "Meent",                hint: "Shopping and terraces between the Coolsingel and the Markthal." },
  { name: "Blaak",                hint: "Home to the Cube Houses, Markthal and Blaak station." },
  { name: "Westersingel",         hint: "Green canal boulevard lined with sculptures." },
  { name: "Weena",                hint: "The skyscraper avenue in front of Rotterdam Centraal." },
  { name: "Kruiskade",            hint: "Connects Centraal Station's area with the Lijnbaan shops." },
  { name: "Hoogstraat",           hint: "Rotterdam's oldest street, on the medieval dam in the Rotte." },
  { name: "Nieuwe Binnenweg",     hint: "Long, lively street heading west from the Westersingel." },
  { name: "Oude Binnenweg",       hint: "Short café street just off the Lijnbaan." },
  { name: "Westblaak",            hint: "Wide boulevard with the skatepark, west of the Blaak." },
  { name: "Boompjes",             hint: "Riverside boulevard along the Nieuwe Maas." },
  { name: "Schiedamsedijk",       hint: "Runs from Churchillplein down to the Maritime Museum." },
  { name: "Wilhelminakade",       hint: "Kop van Zuid: Hotel New York and the cruise terminal." },
  { name: "Mathenesserlaan",      hint: "Stately avenue through the west, near Museum Boijmans." },
  { name: "Karel Doormanstraat",  hint: "Parallel to the Lijnbaan, next to the Schouwburg." },
  { name: "Binnenrotte",          hint: "The big open market square next to the Markthal and the Laurenskerk." },
  { name: "Goudsesingel",         hint: "Broad singel on the east edge of the city centre." },
  { name: "Zwart Janstraat",      hint: "Bustling shopping street in the Oude Noorden." }
];
