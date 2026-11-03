/**
 * The kit, in the languages a Lisbon front desk actually answers the phone in.
 *
 * The poster is the product's front door and it was English-only, in a city
 * where the person taping it up is as likely to be Portuguese, Brazilian,
 * Spanish, French, German or Polish as English. A hostel should not have to
 * translate our marketing for us.
 *
 * Only what a guest or a receptionist reads is translated: the poster, the
 * sticker and the three lines said at check-in. The explanatory copy around
 * them stays in English, because its audience is the person reading this screen.
 */

export type KitLanguage = "en" | "pt" | "es" | "fr" | "de" | "it" | "pl";

export type KitCopy = {
  /** What the language is called in that language, for the switcher. */
  label: string;
  /** Two-letter tag for <html lang> and the print footer. */
  tag: string;
  poster: {
    title1: string;
    title2: string;
    body: string;
    qrTitle: string;
    qrBody: string;
    foot: string;
  };
  sticker: {
    title: string;
    body: (city: string) => string;
  };
  checkIn: [string, string, string];
};

const kit: Record<KitLanguage, KitCopy> = {
  en: {
    label: "English",
    tag: "en",
    poster: {
      title1: "What's on",
      title2: "tonight?",
      body: "Scan to see every hostel night, gig and cheap dinner within walking distance — and what's on in your next city.",
      qrTitle: "Point your camera here",
      qrBody: "No app to install. Works on any phone.",
      foot: "Away · what's on here, and what'll be on next",
    },
    sticker: {
      title: "Out tonight?",
      body: (city) => `Scan for what's on in ${city} — including the nights in this building.`,
    },
    checkIn: [
      "“Here's your key — and here's what's on tonight.”",
      "“Our dinner is on there, and the pub crawl after it.”",
      "“It also shows your next city, if you tell it where you're going.”",
    ],
  },
  pt: {
    label: "Português",
    tag: "pt",
    poster: {
      title1: "O que há",
      title2: "hoje à noite?",
      body: "Digitalize para ver todas as noites do hostel, concertos e jantares baratos a poucos passos — e o que há na sua próxima cidade.",
      qrTitle: "Aponte a câmara para aqui",
      qrBody: "Sem aplicação para instalar. Funciona em qualquer telemóvel.",
      foot: "Away · o que há aqui, e o que há a seguir",
    },
    sticker: {
      title: "Vai sair hoje?",
      body: (city) => `Digitalize para ver o que há em ${city} — incluindo as noites deste edifício.`,
    },
    checkIn: [
      "“Aqui está a sua chave — e aqui está o que há hoje à noite.”",
      "“O nosso jantar está aí, e a pub crawl a seguir.”",
      "“Também mostra a sua próxima cidade, se disser para onde vai.”",
    ],
  },
  es: {
    label: "Español",
    tag: "es",
    poster: {
      title1: "¿Qué hay",
      title2: "esta noche?",
      body: "Escanea para ver todas las noches del hostel, conciertos y cenas baratas a un paso — y lo que hay en tu próxima ciudad.",
      qrTitle: "Apunta la cámara aquí",
      qrBody: "Sin aplicación que instalar. Funciona en cualquier móvil.",
      foot: "Away · lo que hay aquí, y lo que habrá después",
    },
    sticker: {
      title: "¿Sales esta noche?",
      body: (city) => `Escanea para ver qué hay en ${city} — incluidas las noches de este edificio.`,
    },
    checkIn: [
      "«Aquí tienes tu llave — y aquí está lo que hay esta noche.»",
      "«Nuestra cena está ahí, y la pub crawl después.»",
      "«También muestra tu próxima ciudad, si le dices a dónde vas.»",
    ],
  },
  fr: {
    label: "Français",
    tag: "fr",
    poster: {
      title1: "Qu'est-ce qu'il y a",
      title2: "ce soir ?",
      body: "Scannez pour voir toutes les soirées de l'auberge, les concerts et les dîners pas chers à deux pas — et ce qu'il y a dans votre prochaine ville.",
      qrTitle: "Pointez votre appareil photo ici",
      qrBody: "Aucune application à installer. Fonctionne sur tous les téléphones.",
      foot: "Away · ce qu'il y a ici, et ce qu'il y aura ensuite",
    },
    sticker: {
      title: "Vous sortez ce soir ?",
      body: (city) => `Scannez pour voir ce qu'il y a à ${city} — y compris les soirées de ce bâtiment.`,
    },
    checkIn: [
      "« Voici votre clé — et voici ce qu'il y a ce soir. »",
      "« Notre dîner est dessus, et le pub crawl juste après. »",
      "« Ça montre aussi votre prochaine ville, si vous lui dites où vous allez. »",
    ],
  },
  de: {
    label: "Deutsch",
    tag: "de",
    poster: {
      title1: "Was ist",
      title2: "heute los?",
      body: "Scannen und alle Hostel-Abende, Konzerte und günstigen Abendessen in Laufweite sehen — und was in deiner nächsten Stadt läuft.",
      qrTitle: "Kamera hierhin halten",
      qrBody: "Keine App nötig. Funktioniert auf jedem Handy.",
      foot: "Away · was hier läuft, und was als Nächstes",
    },
    sticker: {
      title: "Heute Abend unterwegs?",
      body: (city) => `Scannen und sehen, was in ${city} läuft — auch die Abende in diesem Haus.`,
    },
    checkIn: [
      "„Hier ist dein Schlüssel — und hier ist, was heute Abend läuft.“",
      "„Unser Abendessen steht drin, und der Pub Crawl danach.“",
      "„Es zeigt auch deine nächste Stadt, wenn du sagst, wohin du fährst.“",
    ],
  },
  it: {
    label: "Italiano",
    tag: "it",
    poster: {
      title1: "Cosa c'è",
      title2: "stasera?",
      body: "Scansiona per vedere tutte le serate dell'ostello, i concerti e le cene economiche a due passi — e cosa c'è nella tua prossima città.",
      qrTitle: "Inquadra qui con la fotocamera",
      qrBody: "Nessuna app da installare. Funziona su qualsiasi telefono.",
      foot: "Away · cosa c'è qui, e cosa ci sarà dopo",
    },
    sticker: {
      title: "Esci stasera?",
      body: (city) => `Scansiona per vedere cosa c'è a ${city} — comprese le serate in questo edificio.`,
    },
    checkIn: [
      "«Ecco la tua chiave — e ecco cosa c'è stasera.»",
      "«La nostra cena è lì dentro, e il pub crawl dopo.»",
      "«Mostra anche la tua prossima città, se gli dici dove vai.»",
    ],
  },
  pl: {
    label: "Polski",
    tag: "pl",
    poster: {
      title1: "Co jest",
      title2: "dziś wieczorem?",
      body: "Zeskanuj kod, aby zobaczyć wszystkie wieczory w hostelu, koncerty i tanie kolacje w zasięgu spaceru — oraz co dzieje się w twoim następnym mieście.",
      qrTitle: "Skieruj aparat tutaj",
      qrBody: "Bez aplikacji. Działa na każdym telefonie.",
      foot: "Away · co jest tutaj, a co będzie dalej",
    },
    sticker: {
      title: "Wychodzisz wieczorem?",
      body: (city) => `Zeskanuj, aby zobaczyć, co jest w ${city} — także wieczory w tym budynku.`,
    },
    checkIn: [
      "„Oto twój klucz — a tu jest to, co dzieje się dziś wieczorem.”",
      "„Nasza kolacja jest w środku, a potem pub crawl.”",
      "„Pokaże też twoje następne miasto, jeśli powiesz, dokąd jedziesz.”",
    ],
  },
};

export const KIT_LANGUAGES = Object.keys(kit) as KitLanguage[];

/** The copy for a language, falling back to English for anything unknown. */
export function kitCopy(language: string | undefined | null): KitCopy {
  const key = (language ?? "").toLowerCase() as KitLanguage;
  return kit[key] ?? kit.en;
}

/** Which language a browser asks for, when it asks for one we speak. */
export function kitLanguageFrom(header: string | null | undefined): KitLanguage {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0].trim().slice(0, 2).toLowerCase() as KitLanguage;
    if (KIT_LANGUAGES.includes(tag)) return tag;
  }
  return "en";
}
