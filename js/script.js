const SPOTIFY_CLIENT_ID = '8be60e3b3ce14011994044138383e5de';
const SPOTIFY_CLIENT_SECRET = 'dc89255bf03240dd984ec22ec26f9156';
const LAST_FM_API_KEY = 'c7a99aff5a7344694b9908ac247c0965';
const GENIUS_ACCESS_TOKEN = 'W91yg2Uq9PI8mxtb-_1JCxTkgxgH9wiWxK_bAR79Q4IJd5sPoPtjZjiMTzcZX9Ch';

async function getSpotifyToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET)
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new Error('Ошибка получения токена Spotify. Проверьте Client ID/Secret и включён ли Web API в настройках.');
  const data = await response.json();
  return data.access_token;
}

async function getSpotifyTrackInfo(artist, trackName) {
  try {
    const token = await getSpotifyToken();

    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artist + ' ' + trackName)}&type=track&limit=1`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const searchData = await searchRes.json();
    if (!searchData.tracks || !searchData.tracks.items.length) return null;
    const trackId = searchData.tracks.items[0].id;

    const featuresRes = await fetch(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const features = await featuresRes.json();
    return {
      bpm: features.tempo || 120,
      energy: features.energy || 0.5,
      brightness: features.danceability || 0.5
    };
  } catch (e) {
    console.warn('Spotify не ответил, используем запасной вариант:', e);
    return null;
  }
}

async function fetchWithProxy(url) {
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl, {
    headers: { 'User-Agent': 'SongID/1.0' }
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response;
}

async function searchTrackLastFm(query) {
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${LAST_FM_API_KEY}&format=json&limit=5`;
  const response = await fetchWithProxy(url);
  const data = await response.json();
  if (data.error) throw new Error('Last.fm error: ' + data.message);
  return data.results.trackmatches.track.map(track => ({
    artist: track.artist,
    title: track.name,
    mbid: track.mbid
  }));
}

async function getTrackTags(artist, trackName) {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LAST_FM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(trackName)}&format=json`;
    const response = await fetchWithProxy(url);
    const data = await response.json();
    if (data.track && data.track.toptags && data.track.toptags.tag) {
      return data.track.toptags.tag.map(tag => tag.name);
    }
  } catch (e) {
    console.warn('Не удалось получить теги Last.fm:', e);
  }
  return [];
}

async function getBpmFromDeezer(artist, trackName) {
  try {
    const query = `${artist} ${trackName}`;
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && data.data.length > 0 && data.data[0].bpm) {
      return data.data[0].bpm;
    }
  } catch (e) {
    console.warn('Deezer не ответил:', e);
  }
  return null;
}

async function searchLyricsInGenius(query) {
  const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}&access_token=${GENIUS_ACCESS_TOKEN}`);
  const data = await res.json();
  return data.response.hits.slice(0, 5).map(hit => ({
    artist: hit.result.primary_artist.name,
    title: hit.result.title,
    url: hit.result.url,
    lyrics: 'Текст доступен по ссылке: ' + hit.result.url
  }));
}

function translateGenre(engTag) {
  const dict = {
    'electronic': 'Электронная', 'techno': 'Техно', 'house': 'Хаус', 'trance': 'Транс',
    'dubstep': 'Дабстеп', 'edm': 'EDM', 'bass': 'Бас-музыка', 'drum and bass': 'Драм-н-бейс',
    'hip hop': 'Хип-хоп', 'rap': 'Рэп', 'trap': 'Трэп', 'lo-fi': 'Лоу-фай',
    'rnb': 'R&B', 'soul': 'Соул', 'funk': 'Фанк', 'disco': 'Диско',
    'pop': 'Поп-музыка', 'synthpop': 'Синти-поп', 'indie pop': 'Инди-поп',
    'rock': 'Рок', 'alternative rock': 'Альтернативный рок', 'indie rock': 'Инди-рок',
    'metal': 'Метал', 'heavy metal': 'Хэви-метал', 'thrash metal': 'Трэш-метал',
    'jazz': 'Джаз', 'smooth jazz': 'Смус-джаз', 'fusion': 'Фьюжн',
    'classical': 'Классика', 'orchestral': 'Оркестровая', 'piano': 'Фортепианная',
    'blues': 'Блюз', 'country': 'Кантри', 'folk': 'Фолк',
    'reggae': 'Регги', 'dub': 'Даб', 'latin': 'Латинская', 'salsa': 'Сальса',
    'reggaeton': 'Реггетон', 'ambient': 'Эмбиент', 'downtempo': 'Даунтемпо',
    'world': 'World Music', 'afrobeat': 'Афро-бит', 'ethno': 'Этно',
    'experimental': 'Экспериментальная', 'noise': 'Нойз', 'industrial': 'Индастриал',
    'post-rock': 'Пост-рок', 'shoegaze': 'Шугейз', 'dream pop': 'Дрим-поп',
    'darkwave': 'Дарквейв', 'synthwave': 'Синтвейв', 'vaporwave': 'Вейпорвейв',
    'chillwave': 'Чиллвейв', 'lo-fi hip hop': 'Лоу-фай хип-хоп', 'phonk': 'Фонк',
    'drill': 'Дрилл', 'grime': 'Грайм', 'uk garage': 'UK-гэридж', 'future garage': 'Фьюче-гэридж',
    'deep house': 'Дип-хаус', 'tech house': 'Тек-хаус', 'progressive house': 'Прогрессив-хаус',
    'melodic techno': 'Мелодик-техно', 'hard techno': 'Хард-техно', 'acid techno': 'Эсид-техно',
    'minimal techno': 'Минимал-техно', 'detroit techno': 'Детройт-техно',
    'breakbeat': 'Брейкбит', 'jungle': 'Джангл', 'drumfunk': 'Драмфанк',
    'neurofunk': 'Нейрофанк', 'liquid drum and bass': 'Люид-драм-н-бейс',
    'glitch': 'Глитч', 'glitch hop': 'Глитч-хоп', 'wonky': 'Вонки',
    'krautrock': 'Краут-рок', 'psychedelic rock': 'Психоделический рок', 'garage rock': 'Гараж-рок',
    'punk rock': 'Панк-рок', 'hardcore punk': 'Хардкор-панк', 'post-punk': 'Пост-панк',
    'new wave': 'Новая волна', 'cold wave': 'Колд-вейв', 'minimal wave': 'Минимал-вейв',
    'death metal': 'Дэт-метал', 'black metal': 'Блэк-метал', 'doom metal': 'Дум-метал',
    'sludge metal': 'Сладж-метал', 'stoner metal': 'Стоунер-метал', 'folk metal': 'Фолк-метал',
    'power metal': 'Пауэр-метал', 'symphonic metal': 'Симфо-метал', 'gothic metal': 'Готик-метал'
  };
  const lower = engTag.toLowerCase();
  return dict[lower] || engTag;
}

function classifyGenre(features, tags = []) {
  const { bpm, energy, brightness } = features;

  if (tags && tags.length > 0) {
    const translatedTags = tags.map(t => translateGenre(t));
    return {
      genre: translatedTags[0] || 'Электронная',
      subgenre: translatedTags.length > 1 ? translatedTags[1] : translatedTags[0],
      confidence: 70,
      alternatives: [],
      explanation: `Жанр определён по тегам Last.fm: ${translatedTags.join(', ')}.`
    };
  }

  let genre = 'Электронная';
  let subgenre = 'Инди-электроника';
  let score = 0.72;
  let logic = '';


  if (bpm >= 120 && bpm <= 130 && energy >= 0.5 && brightness >= 0.45) {
    genre = 'Электронная'; subgenre = 'Мелодик-техно'; score = 0.9;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.45`;
  } else if (bpm >= 140 && bpm <= 150 && energy >= 0.7 && brightness >= 0.6) {
    genre = 'Электронная'; subgenre = 'Транс'; score = 0.88;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.6`;
  } else if (bpm >= 130 && bpm <= 140 && energy >= 0.8 && brightness <= 0.5) {
    genre = 'Бас-музыка'; subgenre = 'Дабстеп'; score = 0.93;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≤ 0.5`;
  } else if (bpm >= 140 && energy >= 0.85 && brightness >= 0.7) {
    genre = 'EDM'; subgenre = 'Электро-хаус'; score = 0.85;
    logic = `BPM ${bpm} ≥ 140, энергия ≥ 0.85, яркость ≥ 0.7`;
  } else if (bpm >= 134 && energy < 0.55 && brightness < 0.45) {
    genre = 'UK-электроника'; subgenre = 'Фьюче-гэридж'; score = 0.86;
    logic = `BPM ${bpm} ≥ 134, энергия < 0.55, яркость < 0.45`;
  } else if (bpm >= 120 && bpm <= 128 && energy >= 0.4 && brightness >= 0.3) {
    genre = 'Электронная'; subgenre = 'Дип-хаус'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.3`;
  } else if (bpm >= 125 && bpm <= 135 && energy >= 0.6 && brightness >= 0.5) {
    genre = 'Электронная'; subgenre = 'Техно'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.6, яркость ≥ 0.5`;
  } else if (bpm >= 90 && bpm <= 115 && energy >= 0.4 && brightness >= 0.3) {
    genre = 'Электронная'; subgenre = 'Даунтемпо'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.3`;
  } else if (bpm >= 110 && bpm <= 130 && energy >= 0.3 && brightness >= 0.6) {
    genre = 'Синт-поп'; subgenre = 'Инди-электроника'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.6`;
  } else if (bpm >= 140 && energy <= 0.3 && brightness <= 0.3) {
    genre = 'Эмбиент'; subgenre = 'Дроун-эмбиент'; score = 0.9;
    logic = `BPM ≥ 140, энергия ≤ 0.3, яркость ≤ 0.3`;
  } else if (bpm >= 80 && bpm <= 100 && energy >= 0.2 && brightness >= 0.2) {
    genre = 'Электронная'; subgenre = 'Чиллвейв'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.2`;
  } else if (bpm >= 160 && bpm <= 180 && energy >= 0.7 && brightness >= 0.5) {
    genre = 'Электронная'; subgenre = 'Драм-н-бейс'; score = 0.88;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.5`;
  } else if (bpm >= 140 && bpm <= 160 && energy >= 0.8 && brightness >= 0.6) {
    genre = 'Электронная'; subgenre = 'Брейкбит'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≥ 0.6`;
  } else if (bpm >= 140 && bpm <= 160 && energy >= 0.9 && brightness >= 0.7) {
    genre = 'Электронная'; subgenre = 'Джангл'; score = 0.87;
    logic = `BPM ${bpm}, энергия ≥ 0.9, яркость ≥ 0.7`;
  } 

  else if (bpm <= 98 && energy < 0.45 && brightness < 0.5) {
    genre = 'Хип-хоп'; subgenre = 'Лоу-фай хип-хоп'; score = 0.88;
    logic = `BPM ≤ 98, энергия < 0.45, яркость < 0.5`;
  } else if (bpm >= 70 && bpm <= 90 && energy < 0.5 && brightness >= 0.3) {
    genre = 'R&B'; subgenre = 'Соул'; score = 0.85;
    logic = `BPM ${bpm}, энергия < 0.5, яркость ≥ 0.3`;
  } else if (bpm >= 80 && bpm <= 100 && energy >= 0.4 && brightness >= 0.4) {
    genre = 'Хип-хоп'; subgenre = 'Трэп'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.4`;
  } else if (bpm >= 60 && bpm <= 80 && energy >= 0.2 && brightness >= 0.2) {
    genre = 'R&B'; subgenre = 'Нео-соул'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.2`;
  } else if (bpm >= 140 && bpm <= 160 && energy >= 0.6 && brightness >= 0.5) {
    genre = 'Хип-хоп'; subgenre = 'Дрилл'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.6, яркость ≥ 0.5`;
  } else if (bpm >= 130 && bpm <= 150 && energy >= 0.7 && brightness >= 0.6) {
    genre = 'Хип-хоп'; subgenre = 'Грайм'; score = 0.84;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.6`;
  } else if (bpm >= 100 && bpm <= 120 && energy >= 0.5 && brightness >= 0.5) {
    genre = 'Хип-хоп'; subgenre = 'Фонк'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.5`;
  } 

  else if (bpm >= 100 && bpm <= 120 && energy >= 0.6 && brightness >= 0.5) {
    genre = 'Поп-музыка'; subgenre = 'Синти-поп'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.6, яркость ≥ 0.5`;
  } else if (bpm >= 110 && bpm <= 130 && energy >= 0.6 && brightness >= 0.6) {
    genre = 'Поп-музыка'; subgenre = 'Данс-поп'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.6, яркость ≥ 0.6`;
  } else if (bpm >= 80 && bpm <= 100 && energy >= 0.4 && brightness >= 0.5) {
    genre = 'Поп-музыка'; subgenre = 'Инди-поп'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.5`;
  } else if (bpm >= 120 && bpm <= 140 && energy >= 0.7 && brightness >= 0.7) {
    genre = 'Поп-музыка'; subgenre = 'Электропоп'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.7`;
  } else if (bpm >= 80 && bpm <= 110 && energy >= 0.3 && brightness >= 0.5) {
    genre = 'Поп-музыка'; subgenre = 'Дрим-поп'; score = 0.75;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.5`;
  } 

  else if (bpm >= 110 && bpm <= 140 && energy >= 0.7 && brightness >= 0.4) {
    genre = 'Рок'; subgenre = 'Альтернативный рок'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.4`;
  } else if (bpm >= 120 && bpm <= 160 && energy >= 0.7 && brightness >= 0.3) {
    genre = 'Рок'; subgenre = 'Инди-рок'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.3`;
  } else if (bpm >= 90 && bpm <= 110 && energy >= 0.5 && brightness >= 0.2) {
    genre = 'Рок'; subgenre = 'Блюз-рок'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.2`;
  } else if (bpm >= 70 && bpm <= 90 && energy >= 0.3 && brightness >= 0.2) {
    genre = 'Рок'; subgenre = 'Фолк-рок'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.2`;
  } else if (bpm >= 130 && bpm <= 160 && energy >= 0.8 && brightness >= 0.4) {
    genre = 'Рок'; subgenre = 'Пост-рок'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≥ 0.4`;
  } else if (bpm >= 160 && bpm <= 200 && energy >= 0.9 && brightness >= 0.3) {
    genre = 'Рок'; subgenre = 'Панк-рок'; score = 0.88;
    logic = `BPM ${bpm}, энергия ≥ 0.9, яркость ≥ 0.3`;
  } else if (bpm >= 140 && bpm <= 180 && energy >= 0.8 && brightness >= 0.4) {
    genre = 'Рок'; subgenre = 'Пост-панк'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≥ 0.4`;
  } else if (bpm >= 90 && bpm <= 120 && energy >= 0.4 && brightness >= 0.3) {
    genre = 'Рок'; subgenre = 'Гараж-рок'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.3`;
  } else if (bpm >= 100 && bpm <= 130 && energy >= 0.5 && brightness >= 0.4) {
    genre = 'Рок'; subgenre = 'Психоделический рок'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.4`;
  } else if (bpm >= 70 && bpm <= 90 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Рок'; subgenre = 'Краут-рок'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } 

  else if (bpm >= 150 && energy >= 0.9 && brightness >= 0.8) {
    genre = 'Метал'; subgenre = 'Хэви-метал'; score = 0.95;
    logic = `BPM ≥ 150, энергия ≥ 0.9, яркость ≥ 0.8`;
  } else if (bpm >= 170 && energy >= 0.9 && brightness >= 0.9) {
    genre = 'Метал'; subgenre = 'Трэш-метал'; score = 0.92;
    logic = `BPM ≥ 170, энергия ≥ 0.9, яркость ≥ 0.9`;
  } else if (bpm >= 100 && bpm <= 140 && energy >= 0.8 && brightness >= 0.6) {
    genre = 'Метал'; subgenre = 'Ню-метал'; score = 0.88;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≥ 0.6`;
  } else if (bpm >= 160 && bpm <= 200 && energy >= 0.9 && brightness >= 0.8) {
    genre = 'Метал'; subgenre = 'Дэт-метал'; score = 0.93;
    logic = `BPM ${bpm}, энергия ≥ 0.9, яркость ≥ 0.8`;
  } else if (bpm >= 180 && bpm <= 220 && energy >= 0.9 && brightness >= 0.9) {
    genre = 'Метал'; subgenre = 'Блэк-метал'; score = 0.95;
    logic = `BPM ${bpm}, энергия ≥ 0.9, яркость ≥ 0.9`;
  } else if (bpm >= 70 && bpm <= 100 && energy >= 0.6 && brightness >= 0.4) {
    genre = 'Метал'; subgenre = 'Дум-метал'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.6, яркость ≥ 0.4`;
  } else if (bpm >= 90 && bpm <= 120 && energy >= 0.7 && brightness >= 0.5) {
    genre = 'Метал'; subgenre = 'Стоунер-метал'; score = 0.83;
    logic = `BPM ${bpm}, энергия ≥ 0.7, яркость ≥ 0.5`;
  } else if (bpm >= 120 && bpm <= 160 && energy >= 0.8 && brightness >= 0.5) {
    genre = 'Метал'; subgenre = 'Пауэр-метал'; score = 0.87;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≥ 0.5`;
  } else if (bpm >= 140 && bpm <= 180 && energy >= 0.8 && brightness >= 0.6) {
    genre = 'Метал'; subgenre = 'Симфо-метал'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.8, яркость ≥ 0.6`;
  } 

  else if (bpm >= 80 && bpm <= 95 && energy < 0.4 && brightness >= 0.3) {
    genre = 'Джаз'; subgenre = 'Акустический джаз'; score = 0.85;
    logic = `BPM ${bpm}, энергия < 0.4, яркость ≥ 0.3`;
  } else if (bpm >= 90 && bpm <= 120 && energy >= 0.3 && brightness >= 0.4) {
    genre = 'Джаз'; subgenre = 'Смус-джаз'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.4`;
  } else if (bpm >= 50 && bpm <= 70 && energy < 0.3 && brightness < 0.3) {
    genre = 'Джаз'; subgenre = 'Кул-джаз'; score = 0.80;
    logic = `BPM ${bpm}, энергия < 0.3, яркость < 0.3`;
  } else if (bpm >= 70 && bpm <= 90 && energy >= 0.2 && brightness >= 0.3) {
    genre = 'Джаз'; subgenre = 'Бибоп'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.3`;
  } else if (bpm >= 90 && bpm <= 130 && energy >= 0.4 && brightness >= 0.5) {
    genre = 'Джаз'; subgenre = 'Фьюжн'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.5`;
  } 

  else if (bpm <= 60 && energy < 0.2) {
    genre = 'Классика'; subgenre = 'Оркестровая'; score = 0.9;
    logic = `BPM ≤ 60, энергия < 0.2`;
  } else if (bpm <= 80 && energy < 0.3 && brightness < 0.3) {
    genre = 'Классика'; subgenre = 'Фортепианная'; score = 0.85;
    logic = `BPM ≤ 80, энергия < 0.3, яркость < 0.3`;
  } else if (bpm >= 40 && bpm <= 70 && energy < 0.2 && brightness < 0.2) {
    genre = 'Классика'; subgenre = 'Камерная'; score = 0.88;
    logic = `BPM ${bpm}, энергия < 0.2, яркость < 0.2`;
  } 

  else if (bpm >= 50 && bpm <= 80 && energy >= 0.2 && brightness <= 0.3) {
    genre = 'Блюз'; subgenre = 'Дельта-блюз'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≤ 0.3`;
  } else if (bpm >= 70 && bpm <= 100 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Блюз'; subgenre = 'Чикаго-блюз'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } else if (bpm >= 80 && bpm <= 110 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Блюз'; subgenre = 'Рок-блюз'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } 

  else if (bpm >= 80 && bpm <= 110 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Кантри'; subgenre = 'Американа'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } else if (bpm >= 90 && bpm <= 120 && energy >= 0.5 && brightness >= 0.4) {
    genre = 'Кантри'; subgenre = 'Кантри-поп'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.4`;
  } else if (bpm >= 70 && bpm <= 100 && energy >= 0.3 && brightness >= 0.2) {
    genre = 'Кантри'; subgenre = 'Кантри-рок'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.2`;
  } 

  else if (bpm >= 60 && bpm <= 90 && energy >= 0.2 && brightness >= 0.3) {
    genre = 'Регги'; subgenre = 'Корневое регги'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.3`;
  } else if (bpm >= 70 && bpm <= 90 && energy >= 0.3 && brightness >= 0.4) {
    genre = 'Регги'; subgenre = 'Даб'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.4`;
  } else if (bpm >= 80 && bpm <= 100 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Регги'; subgenre = 'Рокстеди'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } 
 
  else if (bpm >= 100 && bpm <= 130 && energy >= 0.5 && brightness >= 0.5) {
    genre = 'Латинская'; subgenre = 'Сальса'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.5`;
  } else if (bpm >= 120 && bpm <= 150 && energy >= 0.6 && brightness >= 0.6) {
    genre = 'Латинская'; subgenre = 'Реггетон'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.6, яркость ≥ 0.6`;
  } else if (bpm >= 100 && bpm <= 120 && energy >= 0.5 && brightness >= 0.4) {
    genre = 'Латинская'; subgenre = 'Бачата'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.4`;
  } 

  else if (bpm >= 60 && bpm <= 90 && energy < 0.4 && brightness < 0.4) {
    genre = 'Фолк'; subgenre = 'Акустический фолк'; score = 0.80;
    logic = `BPM ${bpm}, энергия < 0.4, яркость < 0.4`;
  } else if (bpm >= 70 && bpm <= 100 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Фолк'; subgenre = 'Инди-фолк'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } else if (bpm >= 60 && bpm <= 80 && energy >= 0.2 && brightness >= 0.3) {
    genre = 'Фолк'; subgenre = 'Фолк-музыка'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.3`;
  } 

  else if (bpm >= 80 && bpm <= 120 && energy >= 0.4 && brightness >= 0.4) {
    genre = 'World Music'; subgenre = 'Этно-джаз'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.4`;
  } else if (bpm >= 90 && bpm <= 140 && energy >= 0.5 && brightness >= 0.5) {
    genre = 'World Music'; subgenre = 'Афро-бит'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.5`;
  } else if (bpm >= 80 && bpm <= 110 && energy >= 0.4 && brightness >= 0.4) {
    genre = 'World Music'; subgenre = 'Этно-музыка'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≥ 0.4`;
  } 

  else if (bpm >= 60 && bpm <= 100 && energy >= 0.5 && brightness <= 0.3) {
    genre = 'Индастриал'; subgenre = 'Индустриальная'; score = 0.85;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≤ 0.3`;
  } else if (bpm >= 80 && bpm <= 120 && energy >= 0.4 && brightness <= 0.2) {
    genre = 'Экспериментальная'; subgenre = 'Нойз'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.4, яркость ≤ 0.2`;
  } else if (bpm >= 100 && bpm <= 140 && energy >= 0.5 && brightness >= 0.3) {
    genre = 'Экспериментальная'; subgenre = 'Глитч'; score = 0.82;
    logic = `BPM ${bpm}, энергия ≥ 0.5, яркость ≥ 0.3`;
  } else if (bpm >= 70 && bpm <= 100 && energy >= 0.3 && brightness >= 0.2) {
    genre = 'Экспериментальная'; subgenre = 'Пост-рок'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.2`;
  } else if (bpm >= 80 && bpm <= 110 && energy >= 0.3 && brightness >= 0.3) {
    genre = 'Экспериментальная'; subgenre = 'Шугейз'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.3`;
  } else if (bpm >= 70 && bpm <= 90 && energy >= 0.2 && brightness >= 0.4) {
    genre = 'Экспериментальная'; subgenre = 'Дарквейв'; score = 0.80;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.4`;
  } else if (bpm >= 80 && bpm <= 110 && energy >= 0.3 && brightness >= 0.5) {
    genre = 'Экспериментальная'; subgenre = 'Синтвейв'; score = 0.78;
    logic = `BPM ${bpm}, энергия ≥ 0.3, яркость ≥ 0.5`;
  } else if (bpm >= 70 && bpm <= 100 && energy >= 0.2 && brightness >= 0.3) {
    genre = 'Экспериментальная'; subgenre = 'Вейпорвейв'; score = 0.75;
    logic = `BPM ${bpm}, энергия ≥ 0.2, яркость ≥ 0.3`;
  } 

  else {
    genre = 'Электронная'; subgenre = 'Инди-электроника'; score = 0.72;
    logic = `Нестандартные параметры: BPM ${bpm}, энергия ${energy.toFixed(2)}, яркость ${brightness.toFixed(2)}.`;
  }

  const alternatives = [
    { label: `${genre} / ${subgenre}`, conf: score },
    { label: fallbackAlternative(genre), conf: Math.max(0.45, score - 0.12) },
    { label: 'Электронная / Альтернативная', conf: Math.max(0.38, score - 0.21) }
  ];

  return {
    genre,
    subgenre,
    confidence: Math.round(score * 100),
    alternatives,
    explanation: `Логика: ${logic}`
  };
}

function fallbackAlternative(genre) {
  const map = {
    'Электронная': 'Прогрессив-хаус',
    'Бас-музыка': 'Трэп',
    'Хип-хоп': 'Бум-бэп',
    'Синт-поп': 'Электропоп',
    'Метал': 'Дэт-метал',
    'Рок': 'Инди-рок',
    'Джаз': 'Бибоп',
    'Поп-музыка': 'Данс-поп',
    'EDM': 'Биг-рум',
    'Эмбиент': 'Чилаут',
    'R&B': 'Нео-соул',
    'Классика': 'Фортепиано',
    'Блюз': 'Рок-блюз',
    'Кантри': 'Кантри-рок',
    'Регги': 'Рокстеди',
    'Латинская': 'Бачата',
    'Фолк': 'Инди-фолк',
    'World Music': 'Этно-джаз',
    'UK-электроника': 'Фьюче-гэридж',
    'Индастриал': 'Дарк-эмбиент',
    'Экспериментальная': 'Нойз-рок'
  };
  return map[genre] || 'Электронная / Хаус';
}

const tabs = Array.from(document.querySelectorAll('.tab'));
const views = Array.from(document.querySelectorAll('.view'));
const resultBlock = document.getElementById('result');
const fileInput = document.getElementById('audio-file');
const analyzeFileBtn = document.getElementById('analyze-file');
const uploadStatus = document.getElementById('upload-status');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const genreMainEl = document.getElementById('genre-main');
const subgenreEl = document.getElementById('subgenre');
const confidenceEl = document.getElementById('confidence');
const alternativesEl = document.getElementById('alternatives');
const explainEl = document.getElementById('explain');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

fileInput.addEventListener('change', () => {
  analyzeFileBtn.disabled = !fileInput.files.length;
  uploadStatus.textContent = fileInput.files.length ? `Файл выбран: ${fileInput.files[0].name}` : 'Выберите файл, чтобы начать анализ.';
});

analyzeFileBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  uploadStatus.textContent = 'Анализируем аудио...';
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const stats = extractAudioStats(audioBuffer);
    const result = classifyGenre(stats);
    showResult(result, `Источник: загруженный файл «${file.name}».`);
    uploadStatus.textContent = 'Анализ завершен.';
    await audioCtx.close();
  } catch (error) {
    uploadStatus.innerHTML = '<span class="warn">Не удалось распознать файл. Попробуйте другой формат.</span>';
    console.error(error);
  }
});

searchInput.addEventListener('input', async () => {
  const q = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = '';
  if (!q) return;
  searchResults.innerHTML = '<p class="meta">Ищем в Last.fm...</p>';

  try {
    const tracks = await searchTrackLastFm(q);
    if (!tracks.length) {
      searchResults.innerHTML = '<p class="meta">Ничего не найдено. Попробуйте другой запрос.</p>';
      return;
    }
    searchResults.innerHTML = '';
    
    tracks.forEach(track => {
      const el = document.createElement('button');
      el.className = 'search-item';
      el.innerHTML = `<strong>${track.artist} — ${track.title}</strong><br><span class="meta">Источник: Last.fm</span>`;
      
      el.addEventListener('click', async () => {
        el.innerHTML = `<strong>${track.artist} — ${track.title}</strong><br><span class="meta">Получаем реальные данные...</span>`;
        el.disabled = true;

        let stats = await getSpotifyTrackInfo(track.artist, track.title);

        if (!stats) {
          const bpm = await getBpmFromDeezer(track.artist, track.title);
          stats = { bpm: bpm || 120, energy: 0.5, brightness: 0.5 };
        }

        const tags = await getTrackTags(track.artist, track.title);

        const result = classifyGenre(stats, tags);
        showResult(result, `Источник: ${stats.bpm === 120 && stats.energy === 0.5 ? 'Deezer (BPM)' : 'Spotify'} + Last.fm — ${track.artist} / ${track.title}.`);
        
        el.disabled = false;
        el.innerHTML = `<strong>${track.artist} — ${track.title}</strong><br><span class="meta">Источник: Last.fm</span>`;
      });
      searchResults.appendChild(el);
    });
  } catch (error) {
    searchResults.innerHTML = '<p class="meta warn">Ошибка при поиске в Last.fm. Проверьте консоль для деталей.</p>';
    console.error('Ошибка поиска:', error);
  }
});

const lyricsTextarea = document.querySelector('#lyrics textarea');
const lyricsSearchBtn = document.querySelector('#lyrics button');
const lyricsStatus = document.querySelector('#lyrics p');

lyricsSearchBtn.addEventListener('click', async () => {
  const query = lyricsTextarea.value.trim().toLowerCase();
  const existingList = document.querySelector('#lyrics .search-list');
  if(existingList) existingList.remove();
  if (!query) {
    lyricsStatus.textContent = 'Пожалуйста, введите текст для поиска.';
    return;
  }
  lyricsStatus.textContent = 'Ищем в Genius...';
  try {
    const results = await searchLyricsInGenius(query);
    if (!results.length) {
      lyricsStatus.textContent = 'По вашему тексту ничего не найдено. Попробуйте другие слова.';
      return;
    }
    const listContainer = document.createElement('div');
    listContainer.className = 'search-list';
    results.forEach(item => {
      const el = document.createElement('button');
      el.className = 'search-item';
      el.innerHTML = `<strong>${item.artist} — ${item.title}</strong><br><span class="meta">${item.lyrics}</span>`;
      el.addEventListener('click', () => window.open(item.url, '_blank'));
      listContainer.appendChild(el);
    });
    lyricsSearchBtn.parentNode.insertBefore(listContainer, lyricsSearchBtn.nextSibling);
    lyricsStatus.textContent = `Найдено: ${results.length} треков.`;
  } catch (error) {
    lyricsStatus.textContent = 'Ошибка при поиске в Genius.';
    console.error(error);
  }
});

function extractAudioStats(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const frameSize = 1024;
  let energySum = 0, zeroCross = 0;
  for (let i = 1; i < data.length; i++) {
    energySum += data[i] * data[i];
    if ((data[i-1] >= 0 && data[i] < 0) || (data[i-1] < 0 && data[i] >= 0)) zeroCross++;
  }
  const rms = Math.sqrt(energySum / data.length);
  const brightness = Math.min(1, zeroCross / data.length * 9.5);
  const onsetStrength = [];
  for (let i = frameSize; i < data.length; i += frameSize) {
    let local = 0;
    for (let j = 0; j < frameSize; j++) local += Math.abs(data[i+j] || 0);
    onsetStrength.push(local / frameSize);
  }
  let peaks = 0;
  for (let i = 1; i < onsetStrength.length - 1; i++) {
    if (onsetStrength[i] > onsetStrength[i-1] * 1.12 && onsetStrength[i] > onsetStrength[i+1] * 1.12) peaks++;
  }
  const approxBpm = Math.max(65, Math.min(180, Math.round((peaks / Math.max(duration, 1)) * 60 * 0.8 + 75)));
  const energy = Math.min(1, rms * 4.1);
  return { bpm: approxBpm, energy, brightness, sampleRate };
}

function showResult(result, sourceText) {
  genreMainEl.textContent = `Жанр: ${result.genre}`;
  subgenreEl.textContent = `Поджанр: ${result.subgenre}`;
  confidenceEl.textContent = `Точность: ${result.confidence}%`;
  alternativesEl.innerHTML = '';
  result.alternatives.forEach((item, index) => {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `#${index + 1} ${item.label} (${Math.round(item.conf * 100)}%)`;
    alternativesEl.appendChild(badge);
  });
  explainEl.textContent = `${sourceText} ${result.explanation}`;
  resultBlock.classList.add('visible');
  resultBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}