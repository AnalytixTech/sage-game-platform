/**
 * Default Quiz Master question bank.
 *
 * IMPORTANT: which questions a seed selects depends on this list. Any edit (add, remove, reorder,
 * reword) changes puzzles for existing seeds, so it must ship with a rulesVersion bump in rules.ts.
 *
 * Row format: [category, difficulty, question, correct answer, wrong answer x3]
 */

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

type Row = [string, QuizDifficulty, string, string, string, string, string];

const ROWS: Row[] = [
  // General knowledge
  ['general', 'easy', 'How many days are in a leap year?', '366', '365', '364', '360'],
  ['general', 'easy', 'How many continents are there on Earth?', '7', '5', '6', '8'],
  ['general', 'easy', 'What colour do you get by mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown'],
  ['general', 'easy', 'How many minutes are in an hour?', '60', '100', '30', '90'],
  ['general', 'easy', 'Which animal is known as the "King of the Jungle"?', 'Lion', 'Tiger', 'Elephant', 'Gorilla'],
  ['general', 'easy', 'How many legs does a spider have?', '8', '6', '10', '12'],
  ['general', 'easy', 'What is the freezing point of water in degrees Celsius?', '0', '32', '100', '-10'],
  ['general', 'easy', 'How many sides does a hexagon have?', '6', '5', '7', '8'],
  ['general', 'medium', 'How many players are on a standard football (soccer) team on the pitch?', '11', '10', '9', '12'],
  ['general', 'medium', 'Which is the largest ocean on Earth?', 'Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'],
  ['general', 'medium', 'What is the largest mammal in the world?', 'Blue whale', 'African elephant', 'Giraffe', 'Hippopotamus'],
  ['general', 'medium', 'How many bones are in the adult human body?', '206', '201', '212', '196'],
  ['general', 'medium', 'Which language has the most native speakers worldwide?', 'Mandarin Chinese', 'English', 'Spanish', 'Hindi'],
  ['general', 'medium', 'How many hours are in a week?', '168', '144', '172', '160'],
  ['general', 'hard', 'What is the only letter that does not appear in any US state name?', 'Q', 'Z', 'X', 'J'],
  ['general', 'hard', 'How many hearts does an octopus have?', '3', '1', '2', '4'],
  ['general', 'hard', 'What is the collective noun for a group of crows?', 'A murder', 'A flock', 'A parliament', 'A pride'],
  ['general', 'hard', 'Which planet has the most confirmed moons (as of 2024)?', 'Saturn', 'Jupiter', 'Uranus', 'Neptune'],

  // Science
  ['science', 'easy', 'What gas do plants absorb from the air for photosynthesis?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'],
  ['science', 'easy', 'Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury'],
  ['science', 'easy', 'What is H2O more commonly called?', 'Water', 'Salt', 'Hydrogen peroxide', 'Oxygen'],
  ['science', 'easy', 'What is the closest star to Earth?', 'The Sun', 'Proxima Centauri', 'Sirius', 'Polaris'],
  ['science', 'easy', 'Which organ pumps blood around the body?', 'Heart', 'Lungs', 'Liver', 'Kidneys'],
  ['science', 'easy', 'What force keeps us on the ground?', 'Gravity', 'Magnetism', 'Friction', 'Inertia'],
  ['science', 'medium', 'What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go'],
  ['science', 'medium', 'What is the hardest natural substance?', 'Diamond', 'Quartz', 'Granite', 'Iron'],
  ['science', 'medium', 'What part of the cell contains genetic material?', 'Nucleus', 'Ribosome', 'Cell membrane', 'Cytoplasm'],
  ['science', 'medium', 'Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Mars', 'Earth'],
  ['science', 'medium', 'What is the most abundant gas in Earth’s atmosphere?', 'Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon'],
  ['science', 'medium', 'What is the boiling point of water at sea level in degrees Fahrenheit?', '212', '100', '180', '232'],
  ['science', 'medium', 'Which blood cells help fight infection?', 'White blood cells', 'Red blood cells', 'Platelets', 'Plasma cells only'],
  ['science', 'medium', 'What is the chemical symbol for sodium?', 'Na', 'So', 'Sd', 'S'],
  ['science', 'hard', 'What is the speed of light in a vacuum, approximately?', '300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000,000 km/s'],
  ['science', 'hard', 'What is the atomic number of carbon?', '6', '12', '8', '14'],
  ['science', 'hard', 'Which scientist proposed the three laws of motion?', 'Isaac Newton', 'Albert Einstein', 'Galileo Galilei', 'Johannes Kepler'],
  ['science', 'hard', 'What is the powerhouse of the cell?', 'Mitochondria', 'Golgi apparatus', 'Endoplasmic reticulum', 'Lysosome'],
  ['science', 'hard', 'What type of bond involves the sharing of electron pairs between atoms?', 'Covalent bond', 'Ionic bond', 'Hydrogen bond', 'Metallic bond'],
  ['science', 'hard', 'Which element has the chemical symbol Fe?', 'Iron', 'Fluorine', 'Francium', 'Fermium'],

  // Geography
  ['geography', 'easy', 'What is the capital of France?', 'Paris', 'Lyon', 'Marseille', 'Nice'],
  ['geography', 'easy', 'What is the capital of Nigeria?', 'Abuja', 'Lagos', 'Ibadan', 'Kano'],
  ['geography', 'easy', 'What is the capital of the United Kingdom?', 'London', 'Manchester', 'Edinburgh', 'Birmingham'],
  ['geography', 'easy', 'What is the capital of Japan?', 'Tokyo', 'Osaka', 'Kyoto', 'Hiroshima'],
  ['geography', 'easy', 'Which is the longest river in Africa?', 'Nile', 'Congo', 'Niger', 'Zambezi'],
  ['geography', 'easy', 'On which continent is Kenya?', 'Africa', 'Asia', 'South America', 'Europe'],
  ['geography', 'medium', 'What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
  ['geography', 'medium', 'What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['geography', 'medium', 'Which is the largest country in the world by area?', 'Russia', 'Canada', 'China', 'United States'],
  ['geography', 'medium', 'What is the capital of Ghana?', 'Accra', 'Kumasi', 'Tamale', 'Cape Coast'],
  ['geography', 'medium', 'Which is the tallest mountain in the world above sea level?', 'Mount Everest', 'K2', 'Kilimanjaro', 'Mont Blanc'],
  ['geography', 'medium', 'What is the capital of Germany?', 'Berlin', 'Munich', 'Frankfurt', 'Hamburg'],
  ['geography', 'medium', 'Which desert is the largest hot desert in the world?', 'Sahara', 'Kalahari', 'Gobi', 'Arabian'],
  ['geography', 'medium', 'Which city is South Africa’s legislative capital?', 'Cape Town', 'Pretoria', 'Johannesburg', 'Durban'],
  ['geography', 'hard', 'What is the smallest country in the world by area?', 'Vatican City', 'Monaco', 'San Marino', 'Liechtenstein'],
  ['geography', 'hard', 'Which country has the most time zones (including overseas territories)?', 'France', 'Russia', 'United States', 'China'],
  ['geography', 'hard', 'What is the capital of New Zealand?', 'Wellington', 'Auckland', 'Christchurch', 'Hamilton'],
  ['geography', 'hard', 'Which African country has the largest population?', 'Nigeria', 'Ethiopia', 'Egypt', 'DR Congo'],
  ['geography', 'hard', 'Lake Victoria is shared by Uganda, Kenya and which other country?', 'Tanzania', 'Rwanda', 'Burundi', 'Ethiopia'],
  ['geography', 'hard', 'What is the capital of Brazil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador'],

  // History
  ['history', 'easy', 'Who was the first President of the United States?', 'George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'John Adams'],
  ['history', 'easy', 'In which country were the ancient pyramids of Giza built?', 'Egypt', 'Mexico', 'Peru', 'Sudan'],
  ['history', 'easy', 'Which ship famously sank in 1912 after hitting an iceberg?', 'Titanic', 'Lusitania', 'Britannic', 'Mayflower'],
  ['history', 'easy', 'In what year did World War II end?', '1945', '1918', '1939', '1950'],
  ['history', 'medium', 'In which year did Nigeria gain independence?', '1960', '1957', '1963', '1970'],
  ['history', 'medium', 'Who was the first person to walk on the Moon?', 'Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'],
  ['history', 'medium', 'In which year did the Berlin Wall fall?', '1989', '1991', '1985', '1979'],
  ['history', 'medium', 'Which country gained independence from Britain in 1957 under Kwame Nkrumah?', 'Ghana', 'Nigeria', 'Kenya', 'Senegal'],
  ['history', 'medium', 'Who was South Africa’s first democratically elected president?', 'Nelson Mandela', 'Thabo Mbeki', 'F. W. de Klerk', 'Jacob Zuma'],
  ['history', 'medium', 'The Renaissance began in which country?', 'Italy', 'France', 'England', 'Spain'],
  ['history', 'hard', 'In which year did the First World War begin?', '1914', '1912', '1916', '1918'],
  ['history', 'hard', 'Which empire was ruled by Mansa Musa?', 'Mali Empire', 'Songhai Empire', 'Ghana Empire', 'Benin Empire'],
  ['history', 'hard', 'Who wrote the "I Have a Dream" speech?', 'Martin Luther King Jr.', 'Malcolm X', 'Frederick Douglass', 'John F. Kennedy'],
  ['history', 'hard', 'The Magna Carta was signed in which year?', '1215', '1066', '1415', '1315'],
  ['history', 'hard', 'Which organisation was founded in 1945 to promote international cooperation?', 'United Nations', 'League of Nations', 'NATO', 'African Union'],
  ['history', 'hard', 'The Organisation of African Unity was founded in 1963 in which city?', 'Addis Ababa', 'Accra', 'Cairo', 'Nairobi'],

  // Technology
  ['technology', 'easy', 'What does "www" stand for in a website address?', 'World Wide Web', 'World Web Wide', 'Wide World Web', 'Web World Wide'],
  ['technology', 'easy', 'Which company makes the iPhone?', 'Apple', 'Samsung', 'Google', 'Nokia'],
  ['technology', 'easy', 'What does "PC" stand for?', 'Personal computer', 'Private computer', 'Public computer', 'Programmed computer'],
  ['technology', 'easy', 'Which key is commonly used to delete the character to the left of the cursor?', 'Backspace', 'Delete', 'Escape', 'Tab'],
  ['technology', 'medium', 'What does "CPU" stand for?', 'Central processing unit', 'Computer personal unit', 'Central program utility', 'Core processing utility'],
  ['technology', 'medium', 'What does "HTML" stand for?', 'HyperText Markup Language', 'HighText Machine Language', 'Hyperlink Text Management Language', 'Home Tool Markup Language'],
  ['technology', 'medium', 'Which company acquired Android Inc. in 2005?', 'Google', 'Microsoft', 'Apple', 'Samsung'],
  ['technology', 'medium', 'How many bits are in a byte?', '8', '4', '16', '10'],
  ['technology', 'medium', 'What does "Wi-Fi" let devices do?', 'Connect to a network wirelessly', 'Charge wirelessly', 'Store files offline', 'Print documents'],
  ['technology', 'medium', 'Which programming language is mainly used to add interactivity to web pages?', 'JavaScript', 'Python', 'C', 'SQL'],
  ['technology', 'hard', 'What does "HTTP" stand for?', 'HyperText Transfer Protocol', 'High Transfer Text Protocol', 'Hyperlink Transfer Technology Protocol', 'Host Text Transfer Program'],
  ['technology', 'hard', 'Who is widely credited with inventing the World Wide Web?', 'Tim Berners-Lee', 'Bill Gates', 'Vint Cerf', 'Steve Jobs'],
  ['technology', 'hard', 'What does "SQL" stand for?', 'Structured Query Language', 'Simple Query Language', 'Sequential Query Logic', 'Standard Question Language'],
  ['technology', 'hard', 'How many bytes are in a kilobyte in the binary (KiB) definition?', '1024', '1000', '512', '2048'],
  ['technology', 'hard', 'What does "GPU" stand for?', 'Graphics processing unit', 'General processing unit', 'Graphical program utility', 'Global processing unit'],
  ['technology', 'hard', 'Which protocol is used to send email between servers?', 'SMTP', 'FTP', 'HTTP', 'SSH'],

  // Sports
  ['sports', 'easy', 'How often are the Summer Olympic Games normally held?', 'Every 4 years', 'Every 2 years', 'Every year', 'Every 5 years'],
  ['sports', 'easy', 'In which sport would you perform a slam dunk?', 'Basketball', 'Volleyball', 'Tennis', 'Football'],
  ['sports', 'easy', 'How many points is a try worth in rugby union?', '5', '3', '4', '7'],
  ['sports', 'easy', 'Which sport is played at Wimbledon?', 'Tennis', 'Cricket', 'Golf', 'Badminton'],
  ['sports', 'medium', 'Which country won the first FIFA World Cup in 1930?', 'Uruguay', 'Brazil', 'Italy', 'Argentina'],
  ['sports', 'medium', 'How many rings are on the Olympic flag?', '5', '4', '6', '7'],
  ['sports', 'medium', 'In cricket, how many balls are in a standard over?', '6', '5', '8', '10'],
  ['sports', 'medium', 'Which country hosted the 2010 FIFA World Cup?', 'South Africa', 'Brazil', 'Germany', 'Nigeria'],
  ['sports', 'medium', 'How long is a marathon, approximately?', '42.2 km', '26.2 km', '40 km', '50 km'],
  ['sports', 'hard', 'Which nation won the Africa Cup of Nations the most times (as of 2024)?', 'Egypt', 'Cameroon', 'Ghana', 'Nigeria'],
  ['sports', 'hard', 'In golf, what is a score of one under par on a hole called?', 'Birdie', 'Eagle', 'Bogey', 'Albatross'],
  ['sports', 'hard', 'How many players are on a volleyball team on court?', '6', '5', '7', '9'],
  ['sports', 'hard', 'Which country has won the most FIFA World Cup titles?', 'Brazil', 'Germany', 'Italy', 'Argentina'],

  // Travel & relocation (fits apps about studying and moving abroad)
  ['travel', 'easy', 'What document do you usually need to travel between most countries?', 'Passport', 'Driving licence', 'Library card', 'Birth certificate only'],
  ['travel', 'easy', 'What is a visa?', 'Permission to enter or stay in a country', 'A type of passport cover', 'A travel insurance policy', 'A plane ticket'],
  ['travel', 'easy', 'What is the currency of the United Kingdom?', 'Pound sterling', 'Euro', 'Dollar', 'Franc'],
  ['travel', 'easy', 'What is the currency used by most European Union countries?', 'Euro', 'Pound', 'Franc', 'Krona'],
  ['travel', 'easy', 'What is the currency of Nigeria?', 'Naira', 'Cedi', 'Shilling', 'Rand'],
  ['travel', 'medium', 'What is the currency of Canada?', 'Canadian dollar', 'US dollar', 'Pound sterling', 'Euro'],
  ['travel', 'medium', 'What does IELTS test?', 'English language ability', 'Driving skills', 'Maths ability', 'Computer skills'],
  ['travel', 'medium', 'What is a scholarship?', 'Financial support for education', 'A student loan that must be repaid', 'A type of visa', 'A university entrance exam'],
  ['travel', 'medium', 'What is the currency of Ghana?', 'Cedi', 'Naira', 'Rand', 'Dalasi'],
  ['travel', 'medium', 'What is the currency of Japan?', 'Yen', 'Yuan', 'Won', 'Ringgit'],
  ['travel', 'medium', 'Which country’s immigration system uses "Express Entry" for skilled workers?', 'Canada', 'Australia', 'United Kingdom', 'New Zealand'],
  ['travel', 'hard', 'What does "BRP" stand for in UK immigration?', 'Biometric Residence Permit', 'British Residency Pass', 'Border Registration Permit', 'Basic Residence Paper'],
  ['travel', 'hard', 'What is the currency of South Africa?', 'Rand', 'Pula', 'Kwacha', 'Shilling'],
  ['travel', 'hard', 'In immigration terms, what does "permanent residency" usually allow?', 'Living and working indefinitely without citizenship', 'Voting in national elections', 'Holding two passports automatically', 'Visiting only for up to 6 months'],
  ['travel', 'hard', 'Which exam is commonly required for graduate admission to many US universities?', 'GRE', 'IELTS Life Skills', 'SAT Subject Tests', 'A-Levels'],
  ['travel', 'hard', 'What is the Schengen Area?', 'A zone of European countries without internal border checks', 'A European trade tariff', 'A UK visa category', 'An African free-trade zone'],

  // Maths
  ['maths', 'easy', 'What is 7 × 8?', '56', '54', '64', '48'],
  ['maths', 'easy', 'What is 15 + 27?', '42', '32', '44', '41'],
  ['maths', 'easy', 'What is half of 150?', '75', '70', '65', '85'],
  ['maths', 'easy', 'What is 100 − 37?', '63', '73', '67', '57'],
  ['maths', 'medium', 'What is 12 squared?', '144', '124', '132', '148'],
  ['maths', 'medium', 'What is the square root of 81?', '9', '8', '7', '11'],
  ['maths', 'medium', 'What is 25% of 200?', '50', '25', '40', '75'],
  ['maths', 'medium', 'What is the next prime number after 7?', '11', '9', '13', '10'],
  ['maths', 'medium', 'How many degrees are in a right angle?', '90', '180', '45', '360'],
  ['maths', 'hard', 'What is 17 × 23?', '391', '381', '401', '371'],
  ['maths', 'hard', 'What is the sum of the interior angles of a triangle?', '180°', '360°', '90°', '270°'],
  ['maths', 'hard', 'What is 2 to the power of 10?', '1024', '1000', '512', '2048'],
  ['maths', 'hard', 'What is the value of pi to two decimal places?', '3.14', '3.41', '3.12', '3.16'],
  ['maths', 'hard', 'What is 15% of 80?', '12', '15', '10', '8'],

  // Arts & culture
  ['culture', 'easy', 'Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Pablo Picasso', 'Vincent van Gogh'],
  ['culture', 'easy', 'How many strings does a standard guitar have?', '6', '4', '5', '8'],
  ['culture', 'easy', 'Which instrument has black and white keys?', 'Piano', 'Violin', 'Trumpet', 'Drum'],
  ['culture', 'medium', 'Who wrote "Romeo and Juliet"?', 'William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain'],
  ['culture', 'medium', 'Who wrote the novel "Things Fall Apart"?', 'Chinua Achebe', 'Wole Soyinka', 'Ngũgĩ wa Thiong’o', 'Chimamanda Ngozi Adichie'],
  ['culture', 'medium', 'Which Nigerian writer won the Nobel Prize in Literature in 1986?', 'Wole Soyinka', 'Chinua Achebe', 'Ben Okri', 'Buchi Emecheta'],
  ['culture', 'medium', 'Who painted "The Starry Night"?', 'Vincent van Gogh', 'Claude Monet', 'Salvador Dalí', 'Rembrandt'],
  ['culture', 'medium', 'Afrobeat music was pioneered by which Nigerian musician?', 'Fela Kuti', 'King Sunny Adé', 'Burna Boy', 'Femi Kuti'],
  ['culture', 'hard', 'Who wrote "Half of a Yellow Sun"?', 'Chimamanda Ngozi Adichie', 'Chinua Achebe', 'Buchi Emecheta', 'Helon Habila'],
  ['culture', 'hard', 'Who composed the "Moonlight Sonata"?', 'Ludwig van Beethoven', 'Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Frédéric Chopin'],
  ['culture', 'hard', 'In which city is the Louvre museum?', 'Paris', 'Rome', 'Madrid', 'Vienna'],
  ['culture', 'hard', 'Which Shakespeare play features the character Shylock?', 'The Merchant of Venice', 'Othello', 'Hamlet', 'Macbeth'],
];

export interface BankQuestion {
  id: string;
  category: string;
  difficulty: QuizDifficulty;
  question: string;
  answer: string;
  wrong: string[];
}

export const DEFAULT_QUESTION_BANK: readonly BankQuestion[] = ROWS.map(
  ([category, difficulty, question, answer, ...wrong], i) => ({
    id: `bank_${String(i + 1).padStart(3, '0')}`,
    category,
    difficulty,
    question,
    answer,
    wrong,
  })
);

export const QUIZ_CATEGORIES = Array.from(new Set(ROWS.map((row) => row[0])));
