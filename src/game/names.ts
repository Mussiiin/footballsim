// Universo do FootballSim — países, nomes, cidades e padrões por país.

export interface CountryData {
  id: string;
  name: string;
  flag: string;
  rep: number;
  first: string[];
  last: string[];
  cities: string[];
  clubPatterns: string[]; // {city} e {n}
  stadiumSuffixes: string[];
  secondDivisionName: string;
  thirdDivisionName: string;
  fourthDivisionName?: string;
  cupName: string;
  leagueName: string;
  /** Clubes reais por divisão (tier 1, 2, ...). Quando presente, substitui a geração por padrões. */
  realClubs?: Record<number, RealClubSeed[]>;
}

/** Semente de clube real (Brasil Série A 2026 etc.). */
export interface RealClubSeed {
  name: string;
  shortName: string;
  city: string;
  stadium: string;
  capacity: number;
  founded: number;
  /** 1-100 — força/reputação relativa do elenco */
  strength: number;
  /** Diferencial: 1 (grande) a 5 (pequeno) — define tier e objetivos */
  rank: 1 | 2 | 3 | 4 | 5;
  rivals?: string[]; // nomes curtos dos rivais
}

// Países jogáveis do mundo (por enquanto 4 — fácil adicionar mais)
export const COUNTRIES: CountryData[] = [
  {
    id: 'england',
    name: 'Inglaterra',
    flag: '🇬🇧',
    rep: 92,
    first: ['Jack', 'Oliver', 'Harry', 'George', 'Charlie', 'James', 'William', 'Thomas', 'Daniel', 'Joshua', 'Ryan', 'Lewis', 'Callum', 'Liam', 'Mason', 'Ethan', 'Jacob', 'Michael', 'Alexander', 'Benjamin', 'Samuel', 'Joseph', 'Edward', 'Henry', 'Arthur', 'Freddie', 'Albert', 'Oscar', 'Archie', 'Theo', 'Noah', 'Adam', 'Luke', 'Matthew', 'Dylan', 'Owen', 'Connor', 'Declan', 'Kyle', 'Jordan', 'Harvey'],
    last: ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Davies', 'Wilson', 'Evans', 'Thomas', 'Johnson', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Baker', 'Turner', 'Ward', 'Cooper', 'King', 'Harris', 'Clarke', 'Lewis', 'Young', 'Allen', 'Scott', 'Hill', 'Moore', 'Clark', 'Harrison', 'Carter', 'Parker', 'Bennett', 'Murphy', 'Morgan', 'Reed'],
    cities: ['Londres', 'Birmingham', 'Manchester', 'Liverpool', 'Leeds', 'Newcastle', 'Sheffield', 'Bristol', 'Nottingham', 'Leicester', 'Coventry', 'Hull', 'Bradford', 'Stoke', 'Wolverhampton', 'Plymouth', 'Norwich', 'Portsmouth', 'Southampton', 'Oxford', 'Cambridge', 'York', 'Chester', 'Durham', 'Exeter', 'Bath', 'Derby', 'Preston', 'Sunderland', 'Reading', 'Watford', 'Luton', 'Peterborough', 'Ipswich', 'Colchester', 'Brighton', 'Bournemouth', 'Swindon', 'Northampton', 'Gloucester', 'Hereford', 'Worcester', 'Shrewsbury', 'Lancaster', 'Carlisle', 'Dover', 'Hastings', 'Bedford', 'Salisbury', 'Canterbury', 'Lincoln', 'Doncaster', 'Rotherham', 'Grimsby', 'Scunthorpe', 'Bury', 'Oldham', 'Rochdale', 'Wigan', 'Burnley'],
    clubPatterns: ['FC {city}', 'AFC {city}', '{city} Town', '{city} Rovers', '{city} Wanderers', '{city} County', 'Sporting {city}'],
    stadiumSuffixes: ['Stadium', 'Arena', 'Park', 'Ground'],
    secondDivisionName: 'Championship',
    thirdDivisionName: 'League One',
    cupName: 'FA Cup',
    leagueName: 'Premier League',
  },
  {
    id: 'germany',
    name: 'Alemanha',
    flag: '🇩🇪',
    rep: 88,
    first: ['Alexander', 'Bernd', 'Christoph', 'Dieter', 'Erik', 'Frank', 'Georg', 'Hans', 'Ingo', 'Jürgen', 'Klaus', 'Lukas', 'Manfred', 'Norbert', 'Otto', 'Paul', 'Rainer', 'Stefan', 'Thomas', 'Ulrich', 'Volker', 'Werner', 'Andreas', 'Claus', 'Daniel', 'Ernst', 'Felix', 'Günter', 'Heinrich', 'Jan', 'Karl', 'Leon', 'Matthias', 'Niklas', 'Olaf', 'Peter', 'Reinhard', 'Sebastian', 'Tobias', 'Uwe', 'Florian', 'Marcel'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Maier', 'Huber', 'Fuchs', 'Peters', 'Lang', 'Scholz', 'Möller', 'Weiß', 'Jung', 'Hahn', 'Schubert', 'Brandt', 'Vogel'],
    cities: ['Berlim', 'Hamburgo', 'Munique', 'Colônia', 'Frankfurt', 'Stuttgart', 'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden', 'Hannover', 'Nuremberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster', 'Karlsruhe', 'Mannheim', 'Augsburg', 'Wiesbaden', 'Mönchengladbach', 'Gelsenkirchen', 'Aachen', 'Braunschweig', 'Kiel', 'Chemnitz', 'Halle', 'Magdeburg', 'Freiburg', 'Krefeld', 'Mainz', 'Lübeck', 'Erfurt', 'Rostock', 'Kassel', 'Hagen', 'Saarbrücken', 'Potsdam', 'Ludwigshafen', 'Oldenburg', 'Osnabrück', 'Solingen', 'Heidelberg', 'Darmstadt', 'Regensburg', 'Würzburg', 'Ingolstadt', 'Offenbach', 'Ulm', 'Heilbronn', 'Pforzheim', 'Wolfsburg', 'Göttingen', 'Koblenz', 'Trier', 'Jena', 'Dessau'],
    clubPatterns: ['FC {city}', 'SV {city}', 'VfB {city}', 'TSV {city}', 'SC {city}', 'SG {city}', 'FSV {city}'],
    stadiumSuffixes: ['Arena', 'Stadion', 'Sportpark', 'Volkspark'],
    secondDivisionName: '2. Bundesliga',
    thirdDivisionName: '3. Liga',
    cupName: 'DFB-Pokal',
    leagueName: 'Bundesliga',
  },
  {
    id: 'spain',
    name: 'Espanha',
    flag: '🇪🇸',
    rep: 90,
    first: ['Alejandro', 'Álvaro', 'Andrés', 'Antonio', 'Bruno', 'Carlos', 'David', 'Diego', 'Eduardo', 'Enrique', 'Fernando', 'Francisco', 'Gabriel', 'Gonzalo', 'Héctor', 'Ignacio', 'Iván', 'Javier', 'Jorge', 'José', 'Juan', 'Julián', 'Luis', 'Manuel', 'Marcos', 'Mario', 'Miguel', 'Nacho', 'Nicolás', 'Óscar', 'Pablo', 'Pedro', 'Rafael', 'Raúl', 'Rubén', 'Samuel', 'Sergio', 'Tomás', 'Víctor', 'Xavi', 'Adrià', 'Marc'],
    last: ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Molina', 'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Iglesias', 'Medina', 'Cortés', 'Suárez', 'Cruz'],
    cities: ['Madri', 'Barcelona', 'Valência', 'Sevilha', 'Zaragoza', 'Málaga', 'Múrcia', 'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdova', 'Valladolid', 'Vigo', 'Gijón', 'Vitoria', 'La Coruña', 'Granada', 'Elche', 'Oviedo', 'Badalona', 'Cartagena', 'Terrassa', 'Jerez', 'Sabadell', 'Móstoles', 'Alcalá', 'Fuenlabrada', 'Pamplona', 'Almería', 'Leganés', 'San Sebastián', 'Santander', 'Burgos', 'Castellón', 'Albacete', 'Getafe', 'Alcorcón', 'Logroño', 'Badajoz', 'Salamanca', 'Huelva', 'León', 'Tarragona', 'Cádiz', 'Lleida', 'Marbella', 'Dos Hermanas', 'Parla', 'Torrejón', 'Mataró', 'Santa Cruz', 'Jaén', 'Algeciras', 'Orense', 'Reus', 'Girona', 'Avilés', 'Sória', 'Lorca'],
    clubPatterns: ['CF {city}', 'CD {city}', 'UD {city}', '{city} Deportivo', 'Sporting {city}', 'RC {city}', 'AD {city}'],
    stadiumSuffixes: ['Estadio', 'Arena', 'Campo Municipal', 'Estadio Municipal'],
    secondDivisionName: 'La Liga 2',
    thirdDivisionName: 'Primera Federación',
    cupName: 'Copa del Rey',
    leagueName: 'La Liga',
  },
  {
    id: 'italy',
    name: 'Itália',
    flag: '🇮🇹',
    rep: 86,
    first: ['Alessandro', 'Andrea', 'Bruno', 'Carlo', 'Davide', 'Enrico', 'Fabio', 'Gianni', 'Luca', 'Marco', 'Nicola', 'Paolo', 'Riccardo', 'Simone', 'Stefano', 'Tommaso', 'Umberto', 'Valerio', 'Adriano', 'Benedetto', 'Cesare', 'Daniele', 'Emanuele', 'Federico', 'Giacomo', 'Ignazio', 'Lorenzo', 'Matteo', 'Ottavio', 'Piero', 'Rocco', 'Salvatore', 'Tiziano', 'Vittorio', 'Walter', 'Zeno', 'Aldo', 'Beppe', 'Corrado', 'Elio', 'Franco', 'Luigi'],
    last: ['Rossi', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Lombardo', 'Serra', 'Coppola', 'De Santis', 'D\'Angelo', 'Marchetti', 'Parisi', 'Villa', 'Conte', 'Esposito', 'Sartori'],
    cities: ['Roma', 'Milão', 'Nápoles', 'Turim', 'Palermo', 'Gênova', 'Bolonha', 'Florença', 'Bari', 'Catânia', 'Veneza', 'Verona', 'Messina', 'Pádua', 'Trieste', 'Taranto', 'Brèscia', 'Parma', 'Prato', 'Modena', 'Reggio Calabria', 'Reggio Emilia', 'Perúgia', 'Ravena', 'Livorno', 'Cagliari', 'Foggia', 'Rimini', 'Salerno', 'Ferrara', 'Sássari', 'Latina', 'Monza', 'Siracusa', 'Pescara', 'Bérgamo', 'Forlì', 'Trento', 'Vicenza', 'Terni', 'Bolzano', 'Novara', 'Piacenza', 'Ancona', 'Arezzo', 'Údine', 'Cesena', 'Lecce', 'Barletta', 'Alexandria', 'La Spezia', 'Pisa', 'Catanzaro', 'Cosenza', 'Avellino', 'Asti', 'Cremona', 'Varese', 'Como', 'Pesaro', 'Siena'],
    clubPatterns: ['FC {city}', 'US {city}', 'Calcio {city}', 'CD {city}', 'GS {city}', 'Polisportiva {city}', 'ACD {city}'],
    stadiumSuffixes: ['Stadio', 'Arena', 'Stadio Comunale', 'Velodromo'],
    secondDivisionName: 'Serie B',
    thirdDivisionName: 'Serie C',
    cupName: 'Coppa Italia',
    leagueName: 'Serie A',
  },
  {
    id: 'brazil',
    name: 'Brasil',
    flag: '🇧🇷',
    rep: 84,
    first: ['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'João', 'Rafael', 'Thiago', 'Bruno', 'Felipe', 'Gustavo', 'Vinícius', 'Caio', 'Diego', 'Rodrigo', 'Eduardo', 'Leonardo', 'André', 'Carlos', 'Marcos', 'Renato', 'Alexandre', 'Fábio', 'Igor', 'Kaio', 'Luiz', 'Nicolas', 'Otávio', 'Paulo', 'Ricardo', 'Samuel', 'Tiago', 'Vitor', 'Wesley', 'Yuri', 'Arthur', 'Daniel', 'Enzo', 'Fernando', 'Guilherme', 'Henrique', 'Ítalo', 'Jeferson', 'Klaus', 'Léo', 'Murilo', 'Nathan', 'Otávio', 'Pablo', 'Ruan', 'Sávio', 'Talles', 'Ulisses', 'Wagner', 'Xavier', 'Zeca', 'Alan', 'Breno', 'Cauã', 'Davi', 'Erick', 'Felipe', 'Gabriel', 'Heitor', 'Isaac', 'João Pedro', 'Kaique', 'Luan', 'Miguel', 'Noah', 'Otávio', 'Pedro Henrique', 'Raul', 'Sergio', 'Théo', 'Vanderson', 'Wendel', 'Yago'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Barbosa', 'Pinto', 'Cardoso', 'Ramos', 'Correia', 'Moreira', 'Teixeira', 'Marques', 'Freitas', 'Melo', 'Dias', 'Moraes', 'Campos', 'Barros', 'Cavalcanti', 'Duarte', 'Vieira', 'Farias', 'Siqueira', 'Fonseca', 'Nogueira', 'Peixoto', 'Xavier', 'Assis', 'Bastos', 'Castro', 'Dantas', 'Esteves', 'Ferreira', 'Gonçalves', 'Henriques', 'Inácio', 'Junqueira', 'Klein', 'Lopes', 'Machado', 'Neves', 'Oliveira', 'Penha', 'Queiroz', 'Rezende', 'Sales', 'Tavares', 'Uchôa', 'Vasconcelos', 'Wanderley', 'Ximenes', 'Zanetti', 'Amorim', 'Braga', 'Caldeira', 'Dutra', 'Elias', 'Franco', 'Guedes', 'Holanda', 'Ignácio', 'Jorge', 'Kato', 'Lacerda', 'Maia', 'Noronha', 'Orlando', 'Paes', 'Quaresma', 'Reis', 'Sarmento', 'Toledo', 'Ubaldo', 'Valadares', 'Weber', 'Xavier'],
    cities: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre', 'Curitiba', 'Salvador', 'Fortaleza', 'Recife', 'Manaus', 'Belém', 'Goiânia', 'Florianópolis', 'Vitória', 'Natal', 'João Pessoa', 'Maceió', 'Campo Grande', 'Cuiabá', 'Teresina', 'Aracaju', 'Santos', 'Campinas', 'Niterói', 'Bragança Paulista', 'Chapecó', 'Mirassol', 'Caxias do Sul', 'Londrina', 'Joinville', 'Blumenau', 'Ribeirão Preto', 'Uberlândia', 'Juiz de Fora', 'Santo André', 'Osasco', 'Guarulhos', 'São Bernardo do Campo', 'Pelotas', 'Novo Hamburgo', 'Criciúma', 'Ponta Grossa', 'Maringá', 'Bauru', 'São José dos Campos', 'Sorocaba', 'Piracicaba', 'Americana', 'Franca', 'Botucatu', 'Itu'],
    clubPatterns: ['{city} FC', 'Esporte {city}', 'EC {city}', 'AC {city}', 'Grêmio {city}', 'Clube {city}', 'AD {city}'],
    stadiumSuffixes: ['Arena', 'Estádio', 'Estádio Municipal', 'Complexo Esportivo'],
    secondDivisionName: 'Brasileirão Série B',
    thirdDivisionName: 'Brasileirão Série C',
    fourthDivisionName: 'Brasileirão Série D',
    cupName: 'Copa do Brasil',
    leagueName: 'Brasileirão Série A',
    realClubs: {
      1: [
        { name: 'Flamengo', shortName: 'FLA', city: 'Rio de Janeiro', stadium: 'Maracanã', capacity: 78838, founded: 1895, strength: 88, rank: 1, rivals: ['VAS', 'FLU', 'BOT'] },
        { name: 'Palmeiras', shortName: 'PAL', city: 'São Paulo', stadium: 'Allianz Parque', capacity: 43713, founded: 1914, strength: 87, rank: 1, rivals: ['COR', 'SAO'] },
        { name: 'Cruzeiro', shortName: 'CRU', city: 'Belo Horizonte', stadium: 'Mineirão', capacity: 61846, founded: 1921, strength: 84, rank: 2, rivals: ['CAM'] },
        { name: 'Mirassol', shortName: 'MIR', city: 'Mirassol', stadium: 'Estádio José Maria de Campos Maia', capacity: 15000, founded: 1925, strength: 66, rank: 4 },
        { name: 'Fluminense', shortName: 'FLU', city: 'Rio de Janeiro', stadium: 'Maracanã', capacity: 78838, founded: 1902, strength: 83, rank: 2, rivals: ['FLA', 'BOT'] },
        { name: 'Bahia', shortName: 'BAH', city: 'Salvador', stadium: 'Arena Fonte Nova', capacity: 47907, founded: 1931, strength: 79, rank: 3, rivals: ['VIT'] },
        { name: 'Botafogo', shortName: 'BOT', city: 'Rio de Janeiro', stadium: 'Nilton Santos', capacity: 46831, founded: 1904, strength: 85, rank: 2, rivals: ['FLA', 'VAS', 'FLU'] },
        { name: 'São Paulo', shortName: 'SAO', city: 'São Paulo', stadium: 'Morumbis', capacity: 66795, founded: 1930, strength: 82, rank: 2, rivals: ['PAL', 'COR', 'SAN'] },
        { name: 'Red Bull Bragantino', shortName: 'RBB', city: 'Bragança Paulista', stadium: 'Nabi Abi Chedid', capacity: 17128, founded: 1928, strength: 76, rank: 3 },
        { name: 'Corinthians', shortName: 'COR', city: 'São Paulo', stadium: 'Neo Química Arena', capacity: 47605, founded: 1910, strength: 80, rank: 2, rivals: ['PAL', 'SAO'] },
        { name: 'Grêmio', shortName: 'GRE', city: 'Porto Alegre', stadium: 'Arena do Grêmio', capacity: 55662, founded: 1903, strength: 81, rank: 2, rivals: ['INT'] },
        { name: 'Vasco da Gama', shortName: 'VAS', city: 'Rio de Janeiro', stadium: 'São Januário', capacity: 21880, founded: 1898, strength: 74, rank: 3, rivals: ['FLA', 'BOT'] },
        { name: 'Atlético Mineiro', shortName: 'CAM', city: 'Belo Horizonte', stadium: 'Arena MRV', capacity: 46000, founded: 1908, strength: 83, rank: 2, rivals: ['CRU'] },
        { name: 'Santos', shortName: 'SAN', city: 'Santos', stadium: 'Vila Belmiro', capacity: 16068, founded: 1912, strength: 77, rank: 3, rivals: ['SAO'] },
        { name: 'Vitória', shortName: 'VIT', city: 'Salvador', stadium: 'Barradão', capacity: 34535, founded: 1899, strength: 72, rank: 3, rivals: ['BAH'] },
        { name: 'Internacional', shortName: 'INT', city: 'Porto Alegre', stadium: 'Beira-Rio', capacity: 50128, founded: 1909, strength: 82, rank: 2, rivals: ['GRE'] },
        { name: 'Coritiba', shortName: 'CFC', city: 'Curitiba', stadium: 'Couto Pereira', capacity: 40502, founded: 1909, strength: 73, rank: 3, rivals: ['CAP'] },
        { name: 'Athletico Paranaense', shortName: 'CAP', city: 'Curitiba', stadium: 'Ligga Arena', capacity: 42372, founded: 1924, strength: 78, rank: 3, rivals: ['CFC'] },
        { name: 'Chapecoense', shortName: 'CHA', city: 'Chapecó', stadium: 'Arena Condá', capacity: 20089, founded: 1973, strength: 68, rank: 4 },
        { name: 'Remo', shortName: 'REM', city: 'Belém', stadium: 'Baenão', capacity: 17500, founded: 1905, strength: 64, rank: 5 },
      ],
    },
  },
];

export const CONTINENTAL_COMPETITION = 'Liga dos Campeões Continentais';

export const CONTINENTAL_SUFFIX = 'Copa Continental';

// ------------------------------------------------------------
// Nacionalidades do treinador (países reais com bandeira)
// ------------------------------------------------------------
export interface Nationality {
  name: string;
  flag: string;
}

export const NATIONALITIES: Nationality[] = [
  // América
  { name: 'Brasil', flag: '🇧🇷' }, { name: 'Argentina', flag: '🇦🇷' }, { name: 'Uruguai', flag: '🇺🇾' },
  { name: 'Paraguai', flag: '🇵🇾' }, { name: 'Chile', flag: '🇨🇱' }, { name: 'Colômbia', flag: '🇨🇴' },
  { name: 'Peru', flag: '🇵🇪' }, { name: 'Bolívia', flag: '🇧🇴' }, { name: 'Equador', flag: '🇪🇨' },
  { name: 'Venezuela', flag: '🇻🇪' }, { name: 'México', flag: '🇲🇽' }, { name: 'Estados Unidos', flag: '🇺🇸' },
  { name: 'Canadá', flag: '🇨🇦' }, { name: 'Costa Rica', flag: '🇨🇷' }, { name: 'Panamá', flag: '🇵🇦' },
  { name: 'Cuba', flag: '🇨🇺' }, { name: 'Jamaica', flag: '🇯🇲' }, { name: 'Honduras', flag: '🇭🇳' },
  { name: 'Guatemala', flag: '🇬🇹' }, { name: 'El Salvador', flag: '🇸🇻' }, { name: 'Nicarágua', flag: '🇳🇮' },
  { name: 'República Dominicana', flag: '🇩🇴' }, { name: 'Trinidad e Tobago', flag: '🇹🇹' }, { name: 'Haiti', flag: '🇭🇹' },
  { name: 'Guiana', flag: '🇬🇾' },
  // Europa
  { name: 'Inglaterra', flag: '🇬🇧' }, { name: 'Espanha', flag: '🇪🇸' }, { name: 'Alemanha', flag: '🇩🇪' },
  { name: 'Itália', flag: '🇮🇹' }, { name: 'França', flag: '🇫🇷' }, { name: 'Portugal', flag: '🇵🇹' },
  { name: 'Holanda', flag: '🇳🇱' }, { name: 'Bélgica', flag: '🇧🇪' }, { name: 'Suíça', flag: '🇨🇭' },
  { name: 'Áustria', flag: '🇦🇹' }, { name: 'Suécia', flag: '🇸🇪' }, { name: 'Noruega', flag: '🇳🇴' },
  { name: 'Dinamarca', flag: '🇩🇰' }, { name: 'Finlândia', flag: '🇫🇮' }, { name: 'Islândia', flag: '🇮🇸' },
  { name: 'Irlanda', flag: '🇮🇪' }, { name: 'Polônia', flag: '🇵🇱' }, { name: 'República Tcheca', flag: '🇨🇿' },
  { name: 'Eslováquia', flag: '🇸🇰' }, { name: 'Hungria', flag: '🇭🇺' }, { name: 'Romênia', flag: '🇷🇴' },
  { name: 'Bulgária', flag: '🇧🇬' }, { name: 'Grécia', flag: '🇬🇷' }, { name: 'Croácia', flag: '🇭🇷' },
  { name: 'Sérvia', flag: '🇷🇸' }, { name: 'Bósnia e Herzegovina', flag: '🇧🇦' }, { name: 'Eslovênia', flag: '🇸🇮' },
  { name: 'Macedônia do Norte', flag: '🇲🇰' }, { name: 'Montenegro', flag: '🇲🇪' }, { name: 'Albânia', flag: '🇦🇱' },
  { name: 'Ucrânia', flag: '🇺🇦' }, { name: 'Rússia', flag: '🇷🇺' }, { name: 'Bielorrússia', flag: '🇧🇾' },
  { name: 'Lituânia', flag: '🇱🇹' }, { name: 'Letônia', flag: '🇱🇻' }, { name: 'Estônia', flag: '🇪🇪' },
  { name: 'Luxemburgo', flag: '🇱🇺' }, { name: 'Moldávia', flag: '🇲🇩' }, { name: 'Malta', flag: '🇲🇹' },
  { name: 'Andorra', flag: '🇦🇩' }, { name: 'Mônaco', flag: '🇲🇨' }, { name: 'San Marino', flag: '🇸🇲' },
  { name: 'Liechtenstein', flag: '🇱🇮' },
  // África
  { name: 'Angola', flag: '🇦🇴' }, { name: 'Moçambique', flag: '🇲🇿' }, { name: 'Cabo Verde', flag: '🇨🇻' },
  { name: 'Guiné-Bissau', flag: '🇬🇼' }, { name: 'São Tomé e Príncipe', flag: '🇸🇹' }, { name: 'Nigéria', flag: '🇳🇬' },
  { name: 'Gana', flag: '🇬🇭' }, { name: 'Senegal', flag: '🇸🇳' }, { name: 'Camarões', flag: '🇨🇲' },
  { name: 'Costa do Marfim', flag: '🇨🇮' }, { name: 'Mali', flag: '🇲🇱' }, { name: 'Argélia', flag: '🇩🇿' },
  { name: 'Marrocos', flag: '🇲🇦' }, { name: 'Tunísia', flag: '🇹🇳' }, { name: 'Egito', flag: '🇪🇬' },
  { name: 'Líbia', flag: '🇱🇾' }, { name: 'África do Sul', flag: '🇿🇦' }, { name: 'Quênia', flag: '🇰🇪' },
  { name: 'Etiópia', flag: '🇪🇹' }, { name: 'Tanzânia', flag: '🇹🇿' }, { name: 'Uganda', flag: '🇺🇬' },
  { name: 'Zâmbia', flag: '🇿🇲' }, { name: 'Zimbábue', flag: '🇿🇼' }, { name: 'Gabão', flag: '🇬🇦' },
  { name: 'Guiné', flag: '🇬🇳' }, { name: 'República Democrática do Congo', flag: '🇨🇩' }, { name: 'Congo', flag: '🇨🇬' },
  { name: 'Madagascar', flag: '🇲🇬' }, { name: 'Ruanda', flag: '🇷🇼' }, { name: 'Namíbia', flag: '🇳🇦' },
  { name: 'Botsuana', flag: '🇧🇼' }, { name: 'Maurício', flag: '🇲🇺' }, { name: 'Serra Leoa', flag: '🇸🇱' },
  { name: 'Togo', flag: '🇹🇬' }, { name: 'Benim', flag: '🇧🇯' }, { name: 'Burkina Faso', flag: '🇧🇫' },
  { name: 'Níger', flag: '🇳🇪' }, { name: 'Chade', flag: '🇹🇩' }, { name: 'Sudão', flag: '🇸🇩' },
  { name: 'Sudão do Sul', flag: '🇸🇸' }, { name: 'Eritreia', flag: '🇪🇷' }, { name: 'Somália', flag: '🇸🇴' },
  { name: 'Mauritânia', flag: '🇲🇷' }, { name: 'Malawi', flag: '🇲🇼' }, { name: 'Lesoto', flag: '🇱🇸' },
  { name: 'Essuatíni', flag: '🇸🇿' }, { name: 'Libéria', flag: '🇱🇷' }, { name: 'Comores', flag: '🇰🇲' },
  { name: 'Djibuti', flag: '🇩🇯' }, { name: 'Gâmbia', flag: '🇬🇲' }, { name: 'Guiné Equatorial', flag: '🇬🇶' },
  // Ásia
  { name: 'Japão', flag: '🇯🇵' }, { name: 'Coreia do Sul', flag: '🇰🇷' }, { name: 'Coreia do Norte', flag: '🇰🇵' },
  { name: 'China', flag: '🇨🇳' }, { name: 'Índia', flag: '🇮🇳' }, { name: 'Paquistão', flag: '🇵🇰' },
  { name: 'Indonésia', flag: '🇮🇩' }, { name: 'Tailândia', flag: '🇹🇭' }, { name: 'Vietnã', flag: '🇻🇳' },
  { name: 'Filipinas', flag: '🇵🇭' }, { name: 'Malásia', flag: '🇲🇾' }, { name: 'Singapura', flag: '🇸🇬' },
  { name: 'Arábia Saudita', flag: '🇸🇦' }, { name: 'Emirados Árabes Unidos', flag: '🇦🇪' }, { name: 'Catar', flag: '🇶🇦' },
  { name: 'Kuwait', flag: '🇰🇼' }, { name: 'Irã', flag: '🇮🇷' }, { name: 'Iraque', flag: '🇮🇶' },
  { name: 'Israel', flag: '🇮🇱' }, { name: 'Jordânia', flag: '🇯🇴' }, { name: 'Líbano', flag: '🇱🇧' },
  { name: 'Síria', flag: '🇸🇾' }, { name: 'Iêmen', flag: '🇾🇪' }, { name: 'Omã', flag: '🇴🇲' },
  { name: 'Bahrein', flag: '🇧🇭' }, { name: 'Afeganistão', flag: '🇦🇫' }, { name: 'Bangladesh', flag: '🇧🇩' },
  { name: 'Cazaquistão', flag: '🇰🇿' }, { name: 'Uzbequistão', flag: '🇺🇿' }, { name: 'Quirguistão', flag: '🇰🇬' },
  { name: 'Tajiquistão', flag: '🇹🇯' }, { name: 'Turcomenistão', flag: '🇹🇲' }, { name: 'Mongólia', flag: '🇲🇳' },
  { name: 'Nepal', flag: '🇳🇵' }, { name: 'Sri Lanka', flag: '🇱🇰' }, { name: 'Mianmar', flag: '🇲🇲' },
  { name: 'Laos', flag: '🇱🇦' }, { name: 'Camboja', flag: '🇰🇭' }, { name: 'Brunei', flag: '🇧🇳' },
  { name: 'Timor-Leste', flag: '🇹🇱' }, { name: 'Maldivas', flag: '🇲🇻' }, { name: 'Butão', flag: '🇧🇹' },
  { name: 'Palestina', flag: '🇵🇸' }, { name: 'Chipre', flag: '🇨🇾' }, { name: 'Geórgia', flag: '🇬🇪' },
  { name: 'Armênia', flag: '🇦🇲' }, { name: 'Azerbaijão', flag: '🇦🇿' }, { name: 'Turquia', flag: '🇹🇷' },
  // Oceania
  { name: 'Austrália', flag: '🇦🇺' }, { name: 'Nova Zelândia', flag: '🇳🇿' }, { name: 'Fiji', flag: '🇫🇯' },
  { name: 'Papua-Nova Guiné', flag: '🇵🇬' }, { name: 'Samoa', flag: '🇼🇸' }, { name: 'Tonga', flag: '🇹🇴' },
  { name: 'Vanuatu', flag: '🇻🇺' }, { name: 'Ilhas Salomão', flag: '🇸🇧' },
];
