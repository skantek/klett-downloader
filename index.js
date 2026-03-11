import https from "node:https"
import fs from "node:fs"
import inquirer from "inquirer";
import * as asyncfs from "fs/promises"
import path from 'node:path';

console.log(`
 Witamy w
  _  ___      _   _     _____                      _                 _           
 | |/ / |    | | | |   |  __ \\                    | |               | |          
 | ' /| | ___| |_| |_  | |  | | _____      ___ __ | | ___   __ _  __| | ___ _ __ 
 |  < | |/ _ \\ __| __| | |  | |/ _ \\ \\ /\\ / / '_ \\| |/ _ \\ / _\` |/ _\` |/ _ \\ '__|
 | . \\| |  __/ |_| |_  | |__| | (_) \\ V  V /| | | | | (_) | (_| | (_| |  __/ |   
 |_|\\_\\_|\\___|\\__|\\__| |_____/ \\___/ \\_/\\_/ |_| |_|_|\\___/ \\__,_|\\__,_|\\___|_|   
`);

const languages = ["Wychowanie przedszkolne", "Niemiecki", "Hiszpański", "Rosyjski", "Francuski", "Angielski"]

const languageForm = await inquirer.prompt([
    {
        type: "select",
        name: "languageOrLevel",
        choices: languages,
        message: "Język/poziom"
    }
])

const levelsReq = await fetch(`https://api-chmura.klett.pl/products/language-items?language=${languageForm.languageOrLevel.replace("ń", "n").toLowerCase().replace(" ", "-")}`)
const levels = await levelsReq.json()

const levelsForm = await inquirer.prompt([
    {
        type: "select",
        name: "levelOrAge",
        choices: levels.levels.map((el) => el.long),
        message: "Wybierz poziom"
    }
])

const level = levels.levels.find((obj) => obj.long === levelsForm.levelOrAge)

let books = levels.items.filter((obj) => {return obj.level === level.short})
const series = levels.series.filter((obj) => {return obj.levels.includes(level.short)})

const seriesForm = await inquirer.prompt([
    {
        type: "select",
        name: "series",
        choices: series.map((obj) => {return obj.name}),
        message: "Wybierz serię"
    }
])

const selectedSeries = series.find((obj) => obj.name == seriesForm.series)

books = books.filter((obj) => {return obj.series == selectedSeries.name})

const bookForm = await inquirer.prompt([
    {
        type: "select",
        name: "book",
        choices: books,
        message: "Wybierz podręcznik/ćwiczenia"
    }
])

if (!fs.existsSync("./downloads")) {
    await asyncfs.mkdir("./downloads")
}

const book = books.find((obj) => obj.name === bookForm.book)

const bookRecsReq = await fetch(`https://api-chmura.klett.pl/products/item-details?language=${languageForm.languageOrLevel.replace("ń", "n").toLowerCase().replace(" ", "-")}&level=${level.short}&slug=${book.slug}`);

const bookRecs = await bookRecsReq.json()

async function downloadRecording(item) {
    if (item.type === 'record') {
        const awspatharr = item.aws_directory.split("/")
        const filepath = `./downloads/${book.slug}/${awspatharr[awspatharr.length - 1]}`
        const filename = awspatharr[awspatharr.length - 1]
        const file = fs.createWriteStream(filepath);
        https.get(`https://klett-prod2.s3.amazonaws.com/downloads/original/${item.aws_directory}`, (response) => {
            response.pipe(file)
            file.on('finish', () => {
                file.close(() => {
                    recordingsDownloadedAmount++
                    recordingsDownloadedSize += Math.round(item.size / 1000000)
                console.log(`Pobrano \x1b[32m${filename}\x1b[0m (${Math.round(recordingsDownloadedAmount / recordingsAmount * 100)}%, ${recordingsDownloadedAmount}/${recordingsAmount}, ~${recordingsDownloadedSize}/${recordingsSize} MB)`)
                })
            })
        }).on('error', (err) => {
            fs.unlink(filepath, () => {
                console.log("Nie pobrano, błąd:", err)
            })
        })
    } else if ((item.type === 'video') && item.vimeo_id) {
        console.log(`Video z Vimeo, \x1b[32mpomijanie...\x1b[0m (${item.name})`)
    }
}

if (fs.existsSync(`./downloads/${book.slug}`)) {
    const answer = await inquirer.prompt([
        {
            type: "confirm",
            name: "overwrite",
            message: "Wybrany podręcznik powinien być już pobrany. Pobrać ponownie (nadpisując)?",
            default: false
        }
    ])
    if (answer.overwrite) {
        await asyncfs.rm(`./downloads/${book.slug}`, {recursive: true, force: true})
        await asyncfs.mkdir(`./downloads/${book.slug}`)
    } else {
        console.log("Anulowano.")
        process.exit()
    }
} else {
    fs.mkdirSync(`./downloads/${book.slug}`)
}

let recordingsAmount = 0
let recordingsDownloadedAmount = 0
let recordingsSize = 0
let recordingsDownloadedSize = 0

bookRecs.itemSection.forEach((obj, i) => {
    obj.records.forEach((el, j) => {
        if (!((el.type === 'video') && el.vimeo_id)) {
            recordingsAmount++
            recordingsSize += Math.round(el.size / 1000000)
        }
    })
})

bookRecs.itemSection.forEach((obj, i) => {
    obj.records.forEach((el, j) => {
        downloadRecording(el)
    })
})

function until(conditionFunction) {
  const poll = resolve => {
    if(conditionFunction()) resolve();
    else setTimeout(_ => poll(resolve), 400);
  }

  return new Promise(poll);
}

await until(_ => recordingsDownloadedAmount == recordingsAmount)

console.log(`\nPobieranie zakończone!\nPobrano do: \x1b[32m${path.resolve("./downloads/" + book.slug)}\x1b[0m`)