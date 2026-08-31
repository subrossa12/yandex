using System.Collections.Generic;

namespace Sniper.Localization
{
    /// <summary>
    /// Локализация: RU по умолчанию, плюс TR и EN.
    ///
    /// Русский — язык по умолчанию всегда, включая запуск в редакторе.
    /// Другой включается, только если платформа явно его сообщила или
    /// игрок выбрал сам: язык браузера намеренно не спрашивается, иначе
    /// на машине с английской локалью игра открывалась бы английской.
    ///
    /// Турецкий — рекомендация платформы, это её второй рынок.
    /// </summary>
    public static class Loc
    {
        private static string _lang = "ru";

        public static string Lang => _lang;

        public static void SetLanguage(string lang)
        {
            _lang = lang == "en" || lang == "tr" ? lang : "ru";
        }

        public static string T(string key)
        {
            if (Table.TryGetValue(key, out var row))
            {
                switch (_lang)
                {
                    case "en": return row.En;
                    case "tr": return row.Tr;
                    default: return row.Ru;
                }
            }
            return key;
        }

        public static string T(string key, params object[] args)
        {
            return string.Format(T(key), args);
        }

        private struct Row
        {
            public string Ru, En, Tr;
            public Row(string ru, string en, string tr) { Ru = ru; En = en; Tr = tr; }
        }

        private static readonly Dictionary<string, Row> Table = new Dictionary<string, Row>
        {
            ["title"] = new Row("Контракт", "Contract", "Kontrat"),
            ["menu.contracts"] = new Row("Контракты", "Contracts", "Kontratlar"),
            ["menu.loadout"] = new Row("Снаряжение", "Loadout", "Teçhizat"),
            ["menu.daily"] = new Row("Контракт дня", "Daily contract", "Günün kontratı"),
            ["menu.start"] = new Row("Начать", "Start", "Başla"),
            ["menu.locked"] = new Row("Нужно звёзд: {0}", "Stars needed: {0}", "Gereken yıldız: {0}"),

            ["hud.range"] = new Row("Дистанция", "Range", "Mesafe"),
            ["hud.wind"] = new Row("Ветер", "Wind", "Rüzgâr"),
            ["hud.drop"] = new Row("Падение", "Drop", "Düşüş"),
            ["hud.drift"] = new Row("Снос", "Drift", "Sapma"),
            ["hud.breath"] = new Row("Дыхание", "Breath", "Nefes"),
            ["hud.ammo"] = new Row("Патроны", "Rounds", "Mermi"),
            ["hud.noRangefinder"] = new Row("на глаз", "by eye", "göz kararı"),
            ["hud.alert"] = new Row("Вас заметили", "You are spotted", "Fark edildiniz"),

            ["result.success"] = new Row("Контракт закрыт", "Contract complete", "Kontrat tamam"),
            ["result.failed"] = new Row("Провал", "Failed", "Başarısız"),
            ["result.reward"] = new Row("Награда: {0}", "Reward: {0}", "Ödül: {0}"),
            ["result.retry"] = new Row("Заново", "Retry", "Tekrar"),
            ["result.menu"] = new Row("К контрактам", "To contracts", "Kontratlara"),

            ["fail.bystander"] = new Row("Задет посторонний", "A bystander was hit", "Sivil vuruldu"),
            ["fail.escaped"] = new Row("Цель ушла", "The target escaped", "Hedef kaçtı"),
            ["fail.spotted"] = new Row("Вас обнаружили", "You were detected", "Tespit edildiniz"),
            ["fail.ammo"] = new Row("Патроны кончились", "Out of rounds", "Mermi bitti"),

            ["ch.oneShot"] = new Row("С одного выстрела", "One shot", "Tek atış"),
            ["ch.inTime"] = new Row("Уложиться в срок", "Beat the clock", "Süreye yetiş"),
            ["ch.hazard"] = new Row("Несчастный случай", "Staged accident", "Kaza süsü"),
            ["ch.quiet"] = new Row("Не потревожить охрану", "Leave guards calm", "Muhafızları rahatsız etme"),

            ["ad.secondChance"] = new Row("Смотреть рекламу: второй шанс",
                                          "Watch ad: second chance",
                                          "Reklam izle: ikinci şans"),
            ["ad.intel"] = new Row("Смотреть рекламу: разведданные",
                                   "Watch ad: intel",
                                   "Reklam izle: istihbarat"),
            ["ad.double"] = new Row("Смотреть рекламу: ×2 к награде",
                                    "Watch ad: ×2 reward",
                                    "Reklam izle: ×2 ödül"),
            ["ad.testDrive"] = new Row("Смотреть рекламу: винтовка на миссию",
                                       "Watch ad: rifle for one mission",
                                       "Reklam izle: bir görev için tüfek"),
            ["ad.optional"] = new Row("Всё здесь по желанию. Игра полностью проходится без рекламы.",
                                      "Everything here is optional. The game is fully playable without ads.",
                                      "Buradaki her şey isteğe bağlı. Oyun reklamsız da bitirilebilir."),

            ["shop.buy"] = new Row("Купить", "Buy", "Satın al"),
            ["shop.owned"] = new Row("Куплено", "Owned", "Alındı"),
            ["shop.equip"] = new Row("Взять", "Equip", "Kuşan"),

            ["review.ask"] = new Row("Нравится игра? Поставьте оценку — это помогает.",
                                     "Enjoying the game? A rating really helps.",
                                     "Oyunu beğendiniz mi? Puan vermeniz çok yardımcı olur."),

            ["how.title"] = new Row("Как играть", "How to play", "Nasıl oynanır"),
            ["how.body"] = new Row(
                "Свайп — навести прицел, щипок — кратность, тап — выстрел, два пальца — задержать дыхание. " +
                "Пуля летит не мгновенно: на дальней дистанции целься выше и с поправкой на ветер. " +
                "Иногда проще попасть не в цель, а в то, что над ней висит.",
                "Swipe to aim, pinch to zoom, tap to fire, two fingers to hold your breath. " +
                "The bullet takes time to travel: at long range aim high and account for wind. " +
                "Sometimes it is easier to hit what hangs above the target than the target itself.",
                "Nişan almak için kaydır, yakınlaştırmak için sıkıştır, ateş için dokun, nefes tutmak için iki parmak. " +
                "Mermi anında ulaşmaz: uzun mesafede yukarı nişan al ve rüzgârı hesaba kat. " +
                "Bazen hedefin kendisi yerine üstündeki şeyi vurmak daha kolaydır.")
        };
    }
}
