/**
 * 🌍 Country pages in the country's own language (2026-10-31) — /de/deutschland, /it/italia, /es/espana, /es/mexico,
 * /fr/france, /pt/brasil, /nl/nederland.
 *
 * The /de, /it… landings cover a language; these cover one market each: its own wedding customs, how clients there
 * pay, the e-signature law that applies, its season and time zones — so none is a translated copy of another
 * (Google demotes near-identical doorway pages). Laws are general information only, never legal advice.
 *
 * ⚠️ Honest by design: the app is in English today and every page says so. Product claims = what iwopo does today
 * (multi-event inquiries and contracts, initials + e-signature with an audit record, "Pay directly" confirmed by the
 * vendor, face-grouped galleries, crew check-in, calendar, large-file delivery, per-business currency and time zone).
 * No prices here — plans come from the database.
 *
 * Paths sit under the language prefixes nginx already sends to Express (^/(it|de|es|fr|pt|nl)(/|$)).
 */
export const LOCAL = {
  '/de/deutschland': {
    lang: 'de', hreflang: 'de-DE', locale: 'de_DE', country: 'Deutschland', code: 'DE',
    title: 'Software für Hochzeitsfotografen in Deutschland | iwopo',
    description: 'Anfragen, Verträge mit E-Signatur, Anzahlungen, Buchungen und Galerien – für Hochzeitsfotografen und Hochzeitsfilmer in ganz Deutschland, in Euro.',
    h1: 'Software für Hochzeitsfotografen und Hochzeitsfilmer in Deutschland',
    lead: 'Von der Anfrage über den unterschriebenen Vertrag und die Anzahlung bis zur Galerie – eine Plattform für Hochzeitsfotografen und Hochzeitsfilmer zwischen Hamburg, Berlin, Köln und München, in Euro und in deiner Zeitzone.',
    sections: [
      { h2: 'Standesamt, freie Trauung und Feier', p: [
        'In Deutschland finden standesamtliche Trauung und große Feier oft an verschiedenen Tagen statt – dazu kommen kirchliche oder freie Trauung, Getting Ready, Paarshooting und manchmal ein Polterabend. Das Paar trägt jeden Termin in dein Anfrageformular ein, mit eigenem Datum, eigener Uhrzeit, Location und Gästezahl.',
        'Im Vertrag erscheint jeder Programmpunkt mit seinen Stunden. So ist klar, was gebucht ist – und was als Verlängerung zählt.',
      ] },
      { h2: 'Anzahlung und Vertrag', p: [
        'Das Paar zahlt die Anzahlung so, wie es ohnehin zahlt – per SEPA-Überweisung, PayPal oder bar – und markiert sie im Kundenportal als bezahlt. Du bestätigst den Zahlungseingang, und der Termin ist fest gebucht.',
        'In Deutschland und der EU ist die elektronische Signatur durch die eIDAS-Verordnung grundsätzlich anerkannt. iwopo speichert, wer wann von welcher IP-Adresse was unterschrieben hat, mit einem Abschlusszertifikat. Das ist eine allgemeine Information, keine Rechtsberatung – prüfe die Regeln für dein eigenes Unternehmen.',
      ] },
      { h2: 'Eine kurze Saison, früh ausgebucht', p: [
        'Die meisten Hochzeiten in Deutschland finden zwischen Mai und September statt, und beliebte Samstage sind oft ein Jahr im Voraus vergeben. Anfragen und Buchungen teilen sich einen Datensatz – deshalb siehst du einen belegten Termin, bevor du ihn einem zweiten Paar anbietest.',
        'Second Shooter, Videografen und Assistenten planst du im selben Kalender. Sie sehen nur die Jobs, für die sie eingeteilt sind, und checken am Hochzeitstag per Handy ein.',
      ] },
      { h2: 'Galerien für Paar und Gäste', p: [
        'Nach der Hochzeit lieferst du eine Galerie, in der die Fotos automatisch nach Gesichtern gruppiert werden: Jeder Gast tippt auf sein Gesicht und sieht nur die Bilder, auf denen er zu sehen ist. Große Dateien wie den Hochzeitsfilm verschickst du direkt aus derselben Plattform.',
      ] },
    ],
    faq: [
      ['Ist die iwopo-App auf Deutsch?', 'Noch nicht – die Oberfläche ist derzeit auf Englisch. Anfrageformular, Pakete und Verträge schreibst du selbst, also auf Deutsch.'],
      ['Kann ich in Euro abrechnen?', 'Ja. Jedes Unternehmen legt seine Währung und Zeitzone selbst fest, und das ganze Panel richtet sich danach.'],
      ['Funktioniert das auch für Hochzeiten in Österreich oder der Schweiz?', 'Ja. Jeder Termin einer Buchung hat sein eigenes Datum, seine Uhrzeit und Location – egal, wo er stattfindet.'],
      ['Gibt es eine kostenlose Testphase?', 'Ja, ohne Kreditkarte und jederzeit kündbar.'],
    ],
  },
  '/it/italia': {
    lang: 'it', hreflang: 'it-IT', locale: 'it_IT', country: 'Italia', code: 'IT',
    title: 'Software per fotografi di matrimonio in Italia | iwopo',
    description: 'Richieste, contratti con firma elettronica, acconti, prenotazioni e gallerie per fotografi e videomaker di matrimonio in Italia, in euro.',
    h1: 'Software per fotografi e videomaker di matrimonio in Italia',
    lead: 'Dalla richiesta al contratto firmato, dall’acconto alla consegna della galleria: un’unica piattaforma per chi fotografa e filma matrimoni in Italia, dalle colline toscane ai laghi del nord, fino alla Puglia e alla Sicilia.',
    sections: [
      { h2: 'Matrimoni lunghi, con più momenti', p: [
        'Un matrimonio italiano dura spesso dalla mattina a notte fonda: preparativi, rito civile o religioso, aperitivo, ricevimento e festa. Spesso si aggiungono un servizio prematrimoniale o un day after. Gli sposi inseriscono ogni momento nel tuo modulo di richiesta, con data, orari, location e numero di invitati.',
        'Nel contratto ogni evento compare con le sue ore, così è chiaro cosa è incluso e cosa è uno straordinario.',
      ] },
      { h2: 'Sposi che arrivano dall’estero', p: [
        'Molte coppie arrivano da Regno Unito, Stati Uniti o Nord Europa per sposarsi in Toscana, sul Lago di Como o in Costiera Amalfitana. Portale e galleria si aprono su qualsiasi telefono, e gli orari restano nel tuo fuso orario, sempre indicato, anche quando la coppia firma da un altro continente.',
        'Ogni evento di una prenotazione ha la propria data, i propri orari e la propria location, ovunque si svolga.',
      ] },
      { h2: 'Contratti e acconti', p: [
        'In Italia e nell’Unione Europea la firma elettronica è generalmente riconosciuta dal regolamento eIDAS. iwopo registra chi ha firmato, quando, da quale indirizzo IP e cosa ha firmato, con un certificato di completamento. È un’informazione generale, non una consulenza legale: verifica le regole per la tua attività.',
        'Gli sposi versano l’acconto come pagano già — bonifico, PayPal o contanti — e lo segnano come pagato nel portale. Tu lo confermi quando arriva e la data è bloccata.',
      ] },
      { h2: 'Squadra e gallerie', p: [
        'Secondi fotografi, videomaker e assistenti si assegnano a ogni matrimonio nel calendario: vedono solo i lavori a cui partecipano e fanno il check-in dal telefono. Dopo il matrimonio la galleria raggruppa le foto per volto, così ogni invitato tocca il proprio viso e trova le sue foto. I file pesanti, come il video del matrimonio, si inviano dalla stessa piattaforma.',
      ] },
    ],
    faq: [
      ['L’app di iwopo è in italiano?', 'Non ancora: l’interfaccia è al momento in inglese. Modulo di richiesta, pacchetti e contratti li scrivi tu, in italiano o in inglese per le coppie straniere.'],
      ['Funziona per i matrimoni destination?', 'Sì. Ogni evento ha la propria data, i propri orari e la propria location, e i link per gli sposi si aprono da qualsiasi paese.'],
      ['Posso lavorare in euro?', 'Sì. Ogni attività imposta la propria valuta e il proprio fuso orario.'],
      ['C’è una prova gratuita?', 'Sì, senza carta di credito, e puoi disdire quando vuoi.'],
    ],
  },
  '/es/espana': {
    lang: 'es', hreflang: 'es-ES', locale: 'es_ES', country: 'España', code: 'ES',
    title: 'Software para fotógrafos de bodas en España | iwopo',
    description: 'Solicitudes, contratos con firma electrónica, señales, reservas y galerías para fotógrafos y videógrafos de bodas en España, en euros.',
    h1: 'Software para fotógrafos y videógrafos de bodas en España',
    lead: 'De la solicitud al contrato firmado, la señal, la reserva y la entrega de la galería: una sola plataforma para quienes fotografían y graban bodas en España, de Galicia a Andalucía y de Madrid a las islas.',
    sections: [
      { h2: 'Bodas largas, con preboda y postboda', p: [
        'Una boda en España suele empezar por la tarde y terminar de madrugada: preparativos, ceremonia civil o religiosa, cóctel, banquete y fiesta. Muchas parejas añaden una sesión preboda o postboda. Cada momento entra en tu formulario de solicitud con su fecha, horario, lugar y número de invitados.',
        'En el contrato cada evento aparece con sus horas, así queda claro qué incluye el reportaje y qué son horas extra.',
      ] },
      { h2: 'Señal y contrato', p: [
        'Los novios pagan la señal como ya pagan —Bizum, transferencia o efectivo— y la marcan como pagada en su portal. Tú la confirmas cuando llega y la fecha queda reservada.',
        'En España y la Unión Europea la firma electrónica está generalmente reconocida por el reglamento eIDAS. iwopo registra quién firmó, cuándo, desde qué dirección IP y qué firmó, con un certificado de finalización. Es información general, no asesoría legal: revisa las normas para tu negocio.',
      ] },
      { h2: 'Una temporada que se reserva con antelación', p: [
        'La mayoría de las bodas se concentran entre mayo y octubre, y los sábados más buscados se reservan con un año o más de antelación. Solicitudes y reservas comparten el mismo registro: ves una fecha ocupada antes de ofrecerla a otra pareja.',
        'Segundos fotógrafos, videógrafos y asistentes se asignan a cada boda; solo ven sus trabajos y fichan desde el móvil el día de la boda.',
      ] },
      { h2: 'Galerías para novios e invitados', p: [
        'La galería agrupa las fotos por rostro: cada invitado toca su cara y ve solo las fotos en las que aparece. Los archivos grandes, como el vídeo de la boda, se envían desde la misma plataforma.',
      ] },
    ],
    faq: [
      ['¿La aplicación de iwopo está en español?', 'Todavía no: la interfaz está en inglés por ahora. Tu formulario, tus paquetes y tus contratos los escribes tú, en español.'],
      ['¿Puedo trabajar en euros?', 'Sí. Cada negocio fija su moneda y su zona horaria.'],
      ['¿Sirve para bodas en Canarias o fuera de España?', 'Sí. Cada evento de una reserva tiene su propia fecha, horario y lugar, esté donde esté.'],
      ['¿Hay prueba gratuita?', 'Sí, sin tarjeta y puedes cancelar cuando quieras.'],
    ],
  },
  '/es/mexico': {
    lang: 'es', hreflang: 'es-MX', locale: 'es_MX', country: 'México', code: 'MX',
    title: 'Software para fotógrafos de bodas en México | iwopo',
    description: 'Solicitudes, contratos con firma electrónica, anticipos, reservas y galerías para fotógrafos y videógrafos de bodas en México, en pesos.',
    h1: 'Software para fotógrafos y videógrafos de bodas en México',
    lead: 'De la solicitud al contrato firmado, el anticipo, la reserva y la entrega de la galería: una sola plataforma para quienes fotografían y graban bodas en México, de la Ciudad de México y Guadalajara a San Miguel de Allende y la Riviera Maya.',
    sections: [
      { h2: 'Boda civil, boda religiosa y tornaboda', p: [
        'En México es común que la boda civil y la religiosa sean en días distintos, y muchas celebraciones suman sesión de compromiso, preparativos, recepción y tornaboda al día siguiente. Los novios agregan cada evento a tu formulario de solicitud con su fecha, horario, lugar y número de invitados.',
        'Cada evento aparece en el contrato con sus horas, para que quede claro qué incluye tu paquete y qué es tiempo extra.',
      ] },
      { h2: 'Anticipo y contrato', p: [
        'Los novios pagan el anticipo como ya pagan —transferencia SPEI, depósito bancario o efectivo— y lo marcan como pagado en su portal. Tú lo confirmas cuando llega y la fecha queda apartada.',
        'En México la firma electrónica está reconocida, en general, por las disposiciones del Código de Comercio. iwopo registra quién firmó, cuándo, desde qué dirección IP y qué firmó, con un certificado de finalización. Es información general, no asesoría legal: revisa las normas que aplican a tu negocio.',
      ] },
      { h2: 'Bodas destino y varias zonas horarias', p: [
        'Cancún, Tulum, Los Cabos y Puerto Vallarta reciben parejas de Estados Unidos, Canadá y Europa. El portal y la galería se abren en cualquier celular, y los horarios se muestran en la zona horaria de tu negocio, siempre indicada, aunque la pareja firme desde otro país.',
        'México tiene varias zonas horarias; cada negocio fija la suya y todo el panel la sigue.',
      ] },
      { h2: 'Equipo y galerías', p: [
        'Asigna segundos fotógrafos, videógrafos y asistentes a cada boda: solo ven sus trabajos y registran su llegada desde el celular. Después de la boda, la galería agrupa las fotos por rostro para que cada invitado encuentre las suyas, y los archivos grandes, como el video, se envían desde la misma plataforma.',
      ] },
    ],
    faq: [
      ['¿La aplicación de iwopo está en español?', 'Todavía no: la interfaz está en inglés por ahora. Tu formulario, tus paquetes y tus contratos los escribes tú, en español o en inglés para parejas extranjeras.'],
      ['¿Puedo cobrar en pesos?', 'Sí. Cada negocio fija su moneda y su zona horaria.'],
      ['¿Funciona para bodas destino?', 'Sí. Cada evento tiene su propia fecha, horario y lugar, y los enlaces para los novios se abren desde cualquier país.'],
      ['¿Hay prueba gratuita?', 'Sí, sin tarjeta y puedes cancelar cuando quieras.'],
    ],
  },
  '/fr/france': {
    lang: 'fr', hreflang: 'fr-FR', locale: 'fr_FR', country: 'France', code: 'FR',
    title: 'Logiciel pour photographes de mariage en France | iwopo',
    description: 'Demandes, contrats avec signature électronique, acomptes, réservations et galeries pour photographes et vidéastes de mariage en France, en euros.',
    h1: 'Le logiciel des photographes et vidéastes de mariage en France',
    lead: 'De la demande au contrat signé, de l’acompte à la livraison de la galerie : une seule plateforme pour celles et ceux qui photographient et filment des mariages en France, de la Bretagne à la Provence.',
    sections: [
      { h2: 'Mairie, cérémonie et soirée', p: [
        'En France, le mariage civil à la mairie précède toute cérémonie religieuse ou laïque, parfois le même jour, parfois quelques jours avant. S’y ajoutent les préparatifs, le vin d’honneur, le dîner, la soirée et souvent le brunch du lendemain. Les mariés ajoutent chaque temps fort à votre formulaire de demande, avec sa date, ses horaires, son lieu et son nombre d’invités.',
        'Chaque moment apparaît dans le contrat avec ses heures : ce qui est inclus est clair, les heures supplémentaires aussi.',
      ] },
      { h2: 'Acompte et contrat', p: [
        'Les mariés versent l’acompte comme ils paient déjà — virement, PayPal, chèque ou espèces — et le marquent comme payé dans leur portail. Vous le confirmez à réception et la date est réservée. Acompte ou arrhes : c’est vous qui rédigez votre contrat.',
        'En France et dans l’Union européenne, la signature électronique est en général reconnue par le règlement eIDAS. iwopo enregistre qui a signé, quand, depuis quelle adresse IP et ce qui a été signé, avec un certificat de finalisation. Il s’agit d’une information générale, pas d’un conseil juridique : vérifiez les règles applicables à votre activité.',
      ] },
      { h2: 'Une saison courte, réservée tôt', p: [
        'La plupart des mariages ont lieu entre mai et septembre, et les samedis les plus demandés partent souvent plus d’un an à l’avance. Demandes et réservations partagent le même dossier : une date déjà prise se voit avant d’être proposée à un autre couple.',
        'Seconds photographes, vidéastes et assistants sont affectés à chaque mariage ; ils ne voient que leurs missions et pointent depuis leur téléphone le jour J.',
      ] },
      { h2: 'Des galeries pour les mariés et les invités', p: [
        'La galerie regroupe les photos par visage : chaque invité touche son visage et ne voit que les photos où il apparaît. Les fichiers volumineux, comme le film du mariage, s’envoient depuis la même plateforme.',
      ] },
    ],
    faq: [
      ['L’application iwopo est-elle en français ?', 'Pas encore : l’interface est pour l’instant en anglais. Votre formulaire, vos forfaits et vos contrats, c’est vous qui les rédigez, en français.'],
      ['Puis-je travailler en euros ?', 'Oui. Chaque entreprise choisit sa devise et son fuseau horaire.'],
      ['Est-ce adapté aux mariages en Belgique ou en Suisse ?', 'Oui. Chaque événement d’une réservation a sa propre date, ses horaires et son lieu, où qu’il ait lieu.'],
      ['Y a-t-il un essai gratuit ?', 'Oui, sans carte bancaire et résiliable à tout moment.'],
    ],
  },
  '/pt/brasil': {
    lang: 'pt', hreflang: 'pt-BR', locale: 'pt_BR', country: 'Brasil', code: 'BR',
    title: 'Software para fotógrafos de casamento no Brasil | iwopo',
    description: 'Pedidos de orçamento, contratos com assinatura eletrônica, sinal, reservas e galerias para fotógrafos e videomakers de casamento no Brasil, em reais.',
    h1: 'Software para fotógrafos e videomakers de casamento no Brasil',
    lead: 'Do pedido de orçamento ao contrato assinado, do sinal à entrega da galeria: uma só plataforma para quem fotografa e filma casamentos no Brasil, de São Paulo e do Rio a Minas, ao Sul e ao Nordeste.',
    sections: [
      { h2: 'Civil, religioso, festa e making of', p: [
        'No Brasil, o casamento civil e a cerimônia religiosa muitas vezes acontecem em dias diferentes, e a cobertura costuma incluir making of, cerimônia, festa e ensaio pré-wedding. Mini weddings e elopements também são cada vez mais comuns. Os noivos adicionam cada evento ao seu formulário de orçamento, com data, horários, local e número de convidados.',
        'Cada evento aparece no contrato com as suas horas, deixando claro o que está incluído no pacote e o que é hora extra.',
      ] },
      { h2: 'Sinal e contrato', p: [
        'Os noivos pagam o sinal como já pagam — Pix, transferência ou dinheiro — e marcam como pago no portal. Você confirma quando o valor entra e a data fica reservada. Os links do portal e da galeria abrem em qualquer celular, então dá para enviá-los pelo WhatsApp.',
        'No Brasil, a validade de documentos assinados eletronicamente tem base, em geral, na MP 2.200-2/2001. O iwopo registra quem assinou, quando, de qual endereço IP e o que foi assinado, com um certificado de conclusão. É uma informação geral, não aconselhamento jurídico: confirme as regras aplicáveis ao seu negócio.',
      ] },
      { h2: 'Um país, vários fusos', p: [
        'O Brasil tem mais de um fuso horário. Cada negócio define o seu, e todos os horários — pedidos, reservas, assinaturas — aparecem nele, com o fuso indicado.',
        'Segundos fotógrafos, videomakers e assistentes são escalados para cada casamento; eles veem só os próprios trabalhos e fazem check-in pelo celular no dia.',
      ] },
      { h2: 'Galerias para noivos e convidados', p: [
        'A galeria agrupa as fotos por rosto: cada convidado toca no próprio rosto e vê só as fotos em que aparece. Arquivos grandes, como o filme do casamento, são enviados pela mesma plataforma.',
      ] },
    ],
    faq: [
      ['O aplicativo do iwopo está em português?', 'Ainda não: a interface está em inglês por enquanto. O formulário, os pacotes e os contratos você mesmo escreve, em português.'],
      ['Posso cobrar em reais?', 'Sim. Cada negócio define a própria moeda e o próprio fuso horário.'],
      ['Os noivos podem pagar o sinal por Pix?', 'Sim. Eles pagam como de costume, marcam como pago no portal e você confirma quando o valor entra.'],
      ['Tem teste grátis?', 'Sim, sem cartão de crédito, e você pode cancelar quando quiser.'],
    ],
  },
  '/nl/nederland': {
    lang: 'nl', hreflang: 'nl-NL', locale: 'nl_NL', country: 'Nederland', code: 'NL',
    title: 'Software voor trouwfotografen in Nederland | iwopo',
    description: 'Aanvragen, contracten met e-handtekening, aanbetalingen, boekingen en galerijen voor trouwfotografen en trouwfilmers in Nederland, in euro.',
    h1: 'Software voor trouwfotografen en trouwfilmers in Nederland',
    lead: 'Van aanvraag tot getekend contract, van aanbetaling tot galerij: één platform voor iedereen die bruiloften fotografeert en filmt in Nederland, van de Randstad tot Limburg en de Waddeneilanden.',
    sections: [
      { h2: 'Daggasten, avondgasten en een first look', p: [
        'Een Nederlandse trouwdag heeft vaak een first look, een ceremonie op locatie met een trouwambtenaar of boa, een toost, een diner met de daggasten en een feest waar de avondgasten bij komen. Het bruidspaar zet elk onderdeel in je aanvraagformulier, met eigen tijden, locatie en aantal gasten – zo zie je meteen hoeveel daggasten en avondgasten er zijn.',
        'In het contract staat elk onderdeel met zijn uren, zodat duidelijk is wat er in je pakket zit en wat overuren zijn.',
      ] },
      { h2: 'Aanbetaling en contract', p: [
        'Het bruidspaar betaalt de aanbetaling zoals het al gewend is – met een bankoverschrijving, een Tikkie of contant – en markeert die in het portaal als betaald. Jij bevestigt de ontvangst en de datum staat vast.',
        'In Nederland en de Europese Unie is de elektronische handtekening in het algemeen erkend door de eIDAS-verordening. iwopo legt vast wie wanneer vanaf welk IP-adres wat heeft ondertekend, met een voltooiingscertificaat. Dit is algemene informatie, geen juridisch advies: controleer de regels voor je eigen bedrijf.',
      ] },
      { h2: 'Een kort seizoen, vroeg volgeboekt', p: [
        'De meeste bruiloften vallen tussen mei en september, en populaire vrijdagen en zaterdagen zijn vaak een jaar vooruit vergeven. Aanvragen en boekingen delen hetzelfde dossier, dus een bezette datum zie je voordat je die aan een ander stel aanbiedt.',
        'Second shooters, filmers en assistenten plan je per bruiloft in; ze zien alleen hun eigen opdrachten en checken op de dag in met hun telefoon.',
      ] },
      { h2: 'Galerijen voor het bruidspaar en de gasten', p: [
        'De galerij groepeert foto’s automatisch per gezicht: elke gast tikt op zijn eigen gezicht en ziet alleen de foto’s waarop hij staat. Grote bestanden, zoals de trouwfilm, verstuur je vanuit hetzelfde platform.',
      ] },
    ],
    faq: [
      ['Is de iwopo-app in het Nederlands?', 'Nog niet: de interface is voorlopig in het Engels. Je aanvraagformulier, pakketten en contracten schrijf je zelf, in het Nederlands.'],
      ['Kan ik in euro werken?', 'Ja. Elk bedrijf stelt zijn eigen valuta en tijdzone in.'],
      ['Werkt het ook voor bruiloften in België?', 'Ja. Elk onderdeel van een boeking heeft een eigen datum, tijden en locatie, waar het ook plaatsvindt.'],
      ['Is er een gratis proefperiode?', 'Ja, zonder creditcard en altijd opzegbaar.'],
    ],
  },
};
