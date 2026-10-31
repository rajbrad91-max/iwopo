/**
 * 🌐 Landing pages in other languages (2026-10-31) — for photographers searching in Italian, German, Spanish and
 * French. Each is a full page written in that language (not a machine stub), linked to the English home page and to
 * each other with hreflang so Google shows the right one in each country.
 *
 * ⚠️ Honest by design: iwopo's app is in English today, and every page says so. Facts only — the same product claims
 * as the English pages; e-signature law named as general information; plans and prices come from the database.
 */
export const INTL = {
  it: {
    path: '/it', locale: 'it_IT', name: 'Italiano',
    title: 'Software per fotografi e videomaker di matrimonio | iwopo',
    description: 'Richieste, contratti con firma elettronica, acconti, prenotazioni, gallerie per i clienti, gestione della squadra e sito portfolio: un’unica piattaforma per fotografi di matrimonio.',
    h1: 'Il software tutto-in-uno per fotografi di matrimonio',
    lead: 'Richieste, contratti con firma elettronica, acconti, prenotazioni, gallerie per gli sposi e il tuo sito: tutto in un unico posto, così la parte amministrativa di un matrimonio richiede minuti, non serate.',
    labels: { soon: 'Apertura a breve', soonSub: 'I nuovi studi potranno iscriversi a breve · Hai già un account? Accedi', features: 'Funzioni', pricing: 'Prezzi', login: 'Accedi', trial: 'Prova gratis', faq: 'Domande frequenti', cta: 'Gestisci tutta la tua attività di matrimoni in un unico posto', ctaSub: 'Prova gratuita · Nessuna carta richiesta · Disdici quando vuoi', month: '/mese', storage: 'GB di spazio · tutte le funzioni incluse', other: 'Altre lingue' },
    sections: [
      { h2: 'Dalla richiesta alla consegna delle foto', ul: [
        'Gli sposi compilano il tuo modulo di richiesta, con ogni evento: preparativi, cerimonia, ricevimento e servizio pre-matrimonio.',
        'Invii una cartella di pacchetti; gli sposi scelgono nel loro portale.',
        'Il contratto si compila da solo: date, orari, ore, location, invitati, pacchetto, totale, acconto e saldo.',
        'Gli sposi siglano le sezioni importanti, firmano e versano l’acconto.',
        'La prenotazione entra nel calendario con la tua squadra assegnata.',
        'Dopo il matrimonio consegni una galleria in cui ogni invitato trova le proprie foto.',
      ] },
      { h2: 'Gallerie che gli sposi amano aprire', p: ['Le foto sono raggruppate automaticamente per volto: ogni invitato tocca il proprio viso e vede solo le foto in cui compare. Download singoli o dell’intera galleria in qualità piena, anche dal telefono.'] },
      { h2: 'Contratti e acconti', p: [
        'In Italia e nell’Unione Europea la firma elettronica è riconosciuta dal regolamento eIDAS. iwopo registra chi ha firmato, quando, da quale indirizzo IP e cosa ha firmato, con un certificato di completamento. È un’informazione generale, non una consulenza legale.',
        'Gli sposi pagano l’acconto come pagano già — bonifico, PayPal o contanti — e lo segnano come pagato nel portale. Tu lo confermi quando arriva e la data è prenotata.',
      ] },
      { h2: 'Tutto incluso', ul: ['Modulo di richiesta con domande condizionali', 'Contratti con iniziali e firma elettronica', 'Acconti, prenotazioni e calendario', 'Gestione di secondi fotografi e assistenti', 'Gallerie con riconoscimento dei volti', 'Invio di file di grandi dimensioni', 'Sito portfolio con il tuo dominio', 'Assistente IA per le richieste'] },
    ],
    faq: [
      ['L’app di iwopo è in italiano?', 'Non ancora: l’interfaccia di iwopo è al momento in inglese. Le domande del tuo modulo, i pacchetti e i contratti li scrivi tu, nella lingua che preferisci.'],
      ['Posso usare euro e il fuso orario italiano?', 'Sì. Ogni attività imposta la propria valuta e il proprio fuso orario.'],
      ['C’è una prova gratuita?', 'Sì, senza carta di credito, e puoi disdire quando vuoi.'],
    ],
  },
  de: {
    path: '/de', locale: 'de_DE', name: 'Deutsch',
    title: 'Software für Hochzeitsfotografen und Hochzeitsfilmer | iwopo',
    description: 'Anfragen, Verträge mit E-Signatur, Anzahlungen, Buchungen, Kundengalerien, Teamplanung und Portfolio-Website – eine Plattform für Hochzeitsfotografen.',
    h1: 'Die All-in-one-Software für Hochzeitsfotografen',
    lead: 'Anfragen, Verträge mit elektronischer Signatur, Anzahlungen, Buchungen, Galerien für das Brautpaar und deine Website – alles an einem Ort, damit die Büroarbeit für eine Hochzeit Minuten statt Abende dauert.',
    labels: { soon: 'Bald verfügbar', soonSub: 'Neue Studios können sich bald anmelden · Schon dabei? Anmelden', features: 'Funktionen', pricing: 'Preise', login: 'Anmelden', trial: 'Kostenlos testen', faq: 'Häufige Fragen', cta: 'Dein ganzes Hochzeitsgeschäft an einem Ort', ctaSub: 'Kostenlose Testphase · Keine Kreditkarte · Jederzeit kündbar', month: '/Monat', storage: 'GB Speicher · alle Funktionen inklusive', other: 'Andere Sprachen' },
    sections: [
      { h2: 'Von der Anfrage bis zur Galerie', ul: [
        'Das Paar füllt dein Anfrageformular aus – mit jedem Programmpunkt: Getting Ready, Trauung, Feier und Paarshooting.',
        'Du schickst eine Auswahl an Paketen; das Paar wählt im eigenen Kundenportal.',
        'Der Vertrag füllt sich selbst aus: Datum, Uhrzeiten, Stunden, Location, Gäste, Paket, Gesamtpreis, Anzahlung und Restbetrag.',
        'Das Paar paraphiert die wichtigen Abschnitte, unterschreibt und leistet die Anzahlung.',
        'Die Buchung landet mit deinem Team im Kalender.',
        'Nach der Hochzeit lieferst du eine Galerie, in der jeder Gast seine eigenen Fotos findet.',
      ] },
      { h2: 'Galerien, die Brautpaare gern öffnen', p: ['Fotos werden automatisch nach Gesichtern gruppiert: Jeder Gast tippt auf sein eigenes Gesicht und sieht nur die Bilder, auf denen er zu sehen ist. Downloads einzeln oder als ganze Galerie in voller Qualität – auch am Handy.'] },
      { h2: 'Verträge und Anzahlungen', p: [
        'In Deutschland und der EU ist die elektronische Signatur durch die eIDAS-Verordnung anerkannt. iwopo speichert, wer wann von welcher IP-Adresse was unterschrieben hat, mit einem Abschlusszertifikat. Das ist eine allgemeine Information, keine Rechtsberatung.',
        'Das Paar zahlt die Anzahlung wie gewohnt – per SEPA-Überweisung, PayPal oder bar – und markiert sie im Portal als bezahlt. Du bestätigst den Eingang, und der Termin ist gebucht.',
      ] },
      { h2: 'Alles inklusive', ul: ['Anfrageformular mit bedingten Fragen', 'Verträge mit Paraphen und E-Signatur', 'Anzahlungen, Buchungen und Kalender', 'Planung von Second Shootern und Assistenten', 'Galerien mit Gesichtserkennung', 'Versand großer Dateien', 'Portfolio-Website mit eigener Domain', 'KI-Assistent für Anfragen'] },
    ],
    faq: [
      ['Ist die iwopo-App auf Deutsch?', 'Noch nicht – die Oberfläche von iwopo ist derzeit auf Englisch. Die Fragen deines Formulars, deine Pakete und Verträge schreibst du selbst, in deiner Sprache.'],
      ['Kann ich Euro und die deutsche Zeitzone verwenden?', 'Ja. Jedes Unternehmen legt seine eigene Währung und Zeitzone fest.'],
      ['Gibt es eine kostenlose Testphase?', 'Ja, ohne Kreditkarte und jederzeit kündbar.'],
    ],
  },
  es: {
    path: '/es', locale: 'es_ES', name: 'Español',
    title: 'Software para fotógrafos y videógrafos de bodas | iwopo',
    description: 'Solicitudes, contratos con firma electrónica, anticipos, reservas, galerías para clientes, equipo y web de portafolio: una sola plataforma para fotógrafos de bodas en España, México y Latinoamérica.',
    h1: 'El software todo en uno para fotógrafos de bodas',
    lead: 'Solicitudes, contratos con firma electrónica, anticipos, reservas, galerías para los novios y tu web: todo en un solo lugar, para que la parte administrativa de una boda te lleve minutos y no noches enteras.',
    labels: { soon: 'Muy pronto', soonSub: 'Los nuevos estudios podrán unirse muy pronto · ¿Ya tienes cuenta? Inicia sesión', features: 'Funciones', pricing: 'Precios', login: 'Iniciar sesión', trial: 'Prueba gratis', faq: 'Preguntas frecuentes', cta: 'Lleva todo tu negocio de bodas en un solo lugar', ctaSub: 'Prueba gratuita · Sin tarjeta · Cancela cuando quieras', month: '/mes', storage: 'GB de almacenamiento · todas las funciones incluidas', other: 'Otros idiomas' },
    sections: [
      { h2: 'De la solicitud a la entrega de las fotos', ul: [
        'Los novios rellenan tu formulario de solicitud con cada momento: preparativos, ceremonia, banquete y sesión preboda.',
        'Les envías una carpeta de paquetes y eligen en su propio portal.',
        'El contrato se rellena solo: fecha, horarios, horas, lugar, invitados, paquete, total, anticipo y saldo.',
        'Los novios ponen sus iniciales en las secciones importantes, firman y pagan el anticipo.',
        'La reserva entra en tu calendario con tu equipo asignado.',
        'Después de la boda entregas una galería donde cada invitado encuentra sus propias fotos.',
      ] },
      { h2: 'Galerías que los novios disfrutan', p: ['Las fotos se agrupan automáticamente por rostro: cada invitado toca su cara y ve solo las fotos en las que aparece. Descargas individuales o de la galería completa en calidad original, también desde el móvil.'] },
      { h2: 'Contratos y anticipos', p: [
        'En España y la Unión Europea la firma electrónica está reconocida por el reglamento eIDAS; en México, por las disposiciones sobre firma electrónica del Código de Comercio. iwopo registra quién firmó, cuándo, desde qué dirección IP y qué firmó, con un certificado de finalización. Es información general, no asesoría legal.',
        'Los novios pagan el anticipo como ya pagan — transferencia, Bizum en España, SPEI en México o efectivo — y lo marcan como pagado en su portal. Tú lo confirmas cuando llega y la fecha queda reservada.',
      ] },
      { h2: 'Todo incluido', ul: ['Formulario de solicitud con preguntas condicionales', 'Contratos con iniciales y firma electrónica', 'Anticipos, reservas y calendario', 'Gestión de segundos fotógrafos y asistentes', 'Galerías con reconocimiento facial', 'Envío de archivos grandes', 'Web de portafolio con tu propio dominio', 'Asistente de IA para solicitudes'] },
    ],
    faq: [
      ['¿La aplicación de iwopo está en español?', 'Todavía no: la interfaz de iwopo está por ahora en inglés. Las preguntas de tu formulario, tus paquetes y tus contratos los escribes tú, en tu idioma.'],
      ['¿Puedo usar euros o pesos y mi zona horaria?', 'Sí. Cada negocio define su propia moneda y zona horaria.'],
      ['¿Hay prueba gratuita?', 'Sí, sin tarjeta y puedes cancelar cuando quieras.'],
    ],
  },
  fr: {
    path: '/fr', locale: 'fr_FR', name: 'Français',
    title: 'Logiciel pour photographes et vidéastes de mariage | iwopo',
    description: 'Demandes, contrats avec signature électronique, acomptes, réservations, galeries clients, équipe et site portfolio : une seule plateforme pour les photographes de mariage.',
    h1: 'Le logiciel tout-en-un pour photographes de mariage',
    lead: 'Demandes, contrats avec signature électronique, acomptes, réservations, galeries pour les mariés et votre site : tout au même endroit, pour que l’administratif d’un mariage prenne des minutes, pas des soirées.',
    labels: { soon: 'Bientôt disponible', soonSub: 'Les nouveaux studios pourront s’inscrire très bientôt · Déjà inscrit ? Connexion', features: 'Fonctionnalités', pricing: 'Tarifs', login: 'Connexion', trial: 'Essai gratuit', faq: 'Questions fréquentes', cta: 'Toute votre activité mariage au même endroit', ctaSub: 'Essai gratuit · Sans carte bancaire · Résiliable à tout moment', month: '/mois', storage: 'Go de stockage · toutes les fonctionnalités incluses', other: 'Autres langues' },
    sections: [
      { h2: 'De la demande à la livraison des photos', ul: [
        'Les mariés remplissent votre formulaire de demande avec chaque moment : préparatifs, cérémonie, réception et séance engagement.',
        'Vous envoyez une sélection de formules ; les mariés choisissent dans leur propre espace client.',
        'Le contrat se remplit tout seul : date, horaires, heures, lieu, invités, formule, total, acompte et solde.',
        'Les mariés paraphent les sections importantes, signent et versent l’acompte.',
        'La réservation arrive dans votre calendrier avec votre équipe.',
        'Après le mariage, vous livrez une galerie où chaque invité retrouve ses propres photos.',
      ] },
      { h2: 'Des galeries que les mariés adorent ouvrir', p: ['Les photos sont regroupées automatiquement par visage : chaque invité touche son visage et ne voit que les photos où il apparaît. Téléchargement photo par photo ou de toute la galerie en pleine qualité, même sur mobile.'] },
      { h2: 'Contrats et acomptes', p: [
        'En France et dans l’Union européenne, la signature électronique est reconnue par le règlement eIDAS. iwopo enregistre qui a signé, quand, depuis quelle adresse IP et ce qui a été signé, avec un certificat de signature. Il s’agit d’une information générale, pas d’un conseil juridique.',
        'Les mariés règlent l’acompte comme ils en ont l’habitude — virement, PayPal ou espèces — et le marquent comme payé dans leur espace. Vous le confirmez à réception et la date est réservée.',
      ] },
      { h2: 'Tout est inclus', ul: ['Formulaire de demande avec questions conditionnelles', 'Contrats avec paraphes et signature électronique', 'Acomptes, réservations et calendrier', 'Gestion des seconds photographes et assistants', 'Galeries avec reconnaissance des visages', 'Envoi de fichiers volumineux', 'Site portfolio avec votre propre domaine', 'Assistant IA pour les demandes'] },
    ],
    faq: [
      ['L’application iwopo est-elle en français ?', 'Pas encore : l’interface d’iwopo est pour l’instant en anglais. Les questions de votre formulaire, vos formules et vos contrats, c’est vous qui les rédigez, dans votre langue.'],
      ['Puis-je utiliser l’euro et le fuseau horaire français ?', 'Oui. Chaque entreprise choisit sa devise et son fuseau horaire.'],
      ['Y a-t-il un essai gratuit ?', 'Oui, sans carte bancaire et résiliable à tout moment.'],
    ],
  },

  pt: {
    path: '/pt', locale: 'pt_BR', name: 'Português',
    title: 'Software para fotógrafos e videomakers de casamento | iwopo',
    description: 'Orçamentos, contratos com assinatura eletrônica, sinal, agenda, galerias para clientes, equipe e site de portfólio: uma plataforma para fotógrafos de casamento no Brasil e em Portugal.',
    h1: 'O software completo para fotógrafos de casamento',
    lead: 'Pedidos de orçamento, contratos com assinatura eletrônica, sinal, agenda, galerias para os noivos e o seu site — tudo num só lugar, para que a parte administrativa de um casamento leve minutos, não noites.',
    labels: { soon: 'Em breve', soonSub: 'Novos estúdios poderão entrar em breve · Já tem conta? Entre', features: 'Recursos', pricing: 'Preços', login: 'Entrar', trial: 'Teste grátis', faq: 'Perguntas frequentes', cta: 'Todo o seu negócio de casamentos num só lugar', ctaSub: 'Teste grátis · Sem cartão · Cancele quando quiser', month: '/mês', storage: 'GB de armazenamento · todos os recursos incluídos', other: 'Outros idiomas' },
    sections: [
      { h2: 'Do orçamento à entrega das fotos', ul: [
        'Os noivos preenchem o seu formulário com cada momento: making of, cerimônia, festa e ensaio pré-casamento.',
        'Você envia uma pasta de pacotes e os noivos escolhem no próprio portal.',
        'O contrato se preenche sozinho: data, horários, horas, local, convidados, pacote, total, sinal e saldo.',
        'Os noivos rubricam as seções importantes, assinam e pagam o sinal.',
        'A reserva entra na sua agenda com a equipe definida.',
        'Depois do casamento você entrega uma galeria em que cada convidado encontra as próprias fotos.',
      ] },
      { h2: 'Contratos e sinal', p: [
        'No Brasil, a assinatura eletrônica é reconhecida pela Medida Provisória 2.200-2/2001 e pela Lei 14.063/2020; em Portugal, pelo regulamento europeu eIDAS. O iwopo registra quem assinou, quando, de qual endereço IP e o que foi assinado, com um certificado de conclusão. É uma informação geral, não aconselhamento jurídico.',
        'Os noivos pagam o sinal como já pagam — Pix no Brasil, MB WAY ou transferência em Portugal, ou em dinheiro — e marcam como pago no portal. Você confirma quando o valor chega e a data fica reservada.',
      ] },
      { h2: 'Tudo incluído', ul: ['Formulário com perguntas condicionais', 'Contratos com rubricas e assinatura eletrônica', 'Sinal, reservas e agenda', 'Gestão de segundo fotógrafo e assistentes', 'Galerias com reconhecimento facial', 'Envio de arquivos grandes', 'Site de portfólio com domínio próprio', 'Assistente de IA para pedidos'] },
    ],
    faq: [
      ['O aplicativo do iwopo está em português?', 'Ainda não: a interface do iwopo está por enquanto em inglês. As perguntas do seu formulário, os pacotes e os contratos você escreve no seu idioma.'],
      ['Posso usar reais ou euros e o meu fuso horário?', 'Sim. Cada negócio define a sua moeda e o seu fuso horário.'],
      ['Há teste grátis?', 'Sim, sem cartão de crédito e pode cancelar quando quiser.'],
    ],
  },
  nl: {
    path: '/nl', locale: 'nl_NL', name: 'Nederlands',
    title: 'Software voor trouwfotografen en trouwfilmers | iwopo',
    description: 'Aanvragen, contracten met e-handtekening, aanbetalingen, boekingen, klantgalerijen, team en portfoliowebsite: één platform voor trouwfotografen in Nederland en België.',
    h1: 'De alles-in-één software voor trouwfotografen',
    lead: 'Aanvragen, contracten met elektronische handtekening, aanbetalingen, boekingen, galerijen voor het bruidspaar en je website — alles op één plek, zodat de administratie van een bruiloft minuten kost in plaats van avonden.',
    labels: { soon: 'Binnenkort', soonSub: 'Nieuwe studio’s kunnen zich binnenkort aanmelden · Al een account? Log in', features: 'Functies', pricing: 'Prijzen', login: 'Inloggen', trial: 'Gratis proberen', faq: 'Veelgestelde vragen', cta: 'Je hele trouwbedrijf op één plek', ctaSub: 'Gratis proefperiode · Geen creditcard · Altijd opzegbaar', month: '/maand', storage: 'GB opslag · alle functies inbegrepen', other: 'Andere talen' },
    sections: [
      { h2: 'Van aanvraag tot fotogalerij', ul: [
        'Het bruidspaar vult je aanvraagformulier in, met elk onderdeel: aankleden, ceremonie, feest en loveshoot.',
        'Je stuurt een map met pakketten; het paar kiest in het eigen klantportaal.',
        'Het contract vult zichzelf in: datum, tijden, uren, locatie, gasten, pakket, totaal, aanbetaling en restbedrag.',
        'Het paar parafeert de belangrijke onderdelen, tekent en doet de aanbetaling.',
        'De boeking komt in je agenda, met je team erbij.',
        'Na de bruiloft lever je een galerij waarin elke gast zijn eigen foto’s vindt.',
      ] },
      { h2: 'Contracten en aanbetalingen', p: [
        'In Nederland en België is de elektronische handtekening erkend via de Europese eIDAS-verordening. iwopo legt vast wie wanneer vanaf welk IP-adres wat heeft getekend, met een afrondingscertificaat. Dit is algemene informatie, geen juridisch advies.',
        'Het paar betaalt de aanbetaling zoals ze gewend zijn — via iDEAL, een overboeking of contant — en markeert die in het portaal als betaald. Jij bevestigt de ontvangst en de datum is geboekt.',
      ] },
      { h2: 'Alles inbegrepen', ul: ['Aanvraagformulier met voorwaardelijke vragen', 'Contracten met parafen en e-handtekening', 'Aanbetalingen, boekingen en agenda', 'Planning van second shooters en assistenten', 'Galerijen met gezichtsherkenning', 'Grote bestanden versturen', 'Portfoliowebsite met eigen domein', 'AI-assistent voor aanvragen'] },
    ],
    faq: [
      ['Is de iwopo-app in het Nederlands?', 'Nog niet: de interface van iwopo is voorlopig in het Engels. De vragen van je formulier, je pakketten en contracten schrijf je zelf, in je eigen taal.'],
      ['Kan ik euro’s en mijn tijdzone gebruiken?', 'Ja. Elk bedrijf stelt zijn eigen valuta en tijdzone in.'],
      ['Is er een gratis proefperiode?', 'Ja, zonder creditcard en altijd opzegbaar.'],
    ],
  },
};
