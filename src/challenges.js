// Edit this file to change challenges. `hash` comes from: npm run hash -- <id> "<answer>"
// A challenge with hash: null shows "answer key not set yet" when someone submits.

export const challenges = [
  {
    id: "q1",
    title: "Stand where the camera stood",
    kind: "Geolocation",
    format: "flag{Latitude,Longitude}",
    brief:
      "Find the exact spot this photo was taken from. Give the coordinates with only 4 digits after the decimal point, cut off rather than rounded (112.12345 becomes 112.1234).",
    images: [{ src: "/case1.png", alt: "Street scene beside a river with a cable-stayed bridge in the distance" }],
    stripSpaces: true,
    hash: null, // TODO: npm run hash -- q1 "flag{xx.xxxx,yy.yyyy}"
  },
  {
    id: "q2",
    title: "Four hands, one team",
    kind: "Decode and trace",
    format: "LTCOE{xx_player1_player2_player3}",
    brief:
      "The string below is encoded twice. Decode it, then work out who it points to and what they did. The flag combines a rank with the three team members' handles.",
    code:
      "3oUf8m3L1Rv5dhUaR4XLsJDAShka8Pqa3cG3sfJKfCwqyhW68asyoUaP6ogdBMVuNsbvjWrTpbVCWC8TSv7m2UpjF9uYq3xq2AfYE5a1GNqAP69M1r8BfVdugLe7566QQpt6zXL1oeHiSsuPncjGGVjus2btyin8c5QSqiJ",
    riddle:
      "Two cloaks were wrapped around it, and out of order: the inner first, the outer after. Unwrap it the way it was dressed, count every layer, and only then will it speak.",
    hash: "82adbf028f292d44d160950e05fea2752bfd904b1f356724500222ae9c96bb74",
  },
  {
    id: "q3",
    title: "Nothing is ever deleted",
    kind: "Git forensics",
    format: "LTCOE{...}",
    brief:
      "This repository has more than ten thousand commits, a few deleted branches and several decoy flags. Only one flag is real. Download it and dig through the history.",
    download: { href: "/downloads/challenge-repo.zip", label: "Download challenge-repo.zip", size: "6 MB" },
    riddle:
      "They stand in thousands, all wearing one face, all insisting they are the chosen one. Only one was ever properly christened — the one the clock itself named, before it was sent out into the world. The rest are noise in costume.",
    hash: "5b17b6bff48b2c59627a0074b2e2e1ab18c791ef2df1af970ec05f095ef70e9c",
  },
  {
    id: "q4",
    title: "Three fragments of Latvia",
    kind: "Geolocation",
    format: "LTCOE{City1_City2_City3}",
    brief:
      "Each image points to a place in Latvia. Name the place for each one, in the order shown. Latvian spelling and diacritics are required.",
    images: [
      { src: "/case4-a.jpg", alt: "Forest clearing with pine trunks in the foreground" },
      { src: "/case4-b.jpg", alt: "Large golden pig sculpture on a lawn next to a flower bed" },
      { src: "/case4-c.png", alt: "Granite boulder with a carved portrait relief in a forest" },
    ],
    hash: null, // TODO: npm run hash -- q4 "LTCOE{City1_City2_City3}"
  },
];
