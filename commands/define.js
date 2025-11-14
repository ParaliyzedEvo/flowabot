const axios = require('axios').default;

module.exports = {
    command: ['define', 'dictionary', 'dict'],
    description: "Shows the definition of a word.",
    argsRequired: 1,
    usage: '<word>',
    example: {
        run: "define help",
        result: "Returns the definition for the word 'help'."
    },
    call: obj => {
        return new Promise((resolve, reject) => {   
            let { argv } = obj;
            let word = argv.slice(1).join(" ");

            axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
                .then(result => {
                    if (!Array.isArray(result.data) || !result.data.length) {
                        return reject("No definition found for that word.");
                    }

                    const data = result.data[0];
                    let fields = [];

                    for (const meaning of data.meanings) {
                        if (meaning.definitions.length > 0) {
                            fields.push({
                                name: meaning.partOfSpeech,
                                value: meaning.definitions[0].definition
                            });
                        }
                    }

                    resolve({
                        embeds: [{
                            description: data.phonetic || '',
                            color: 12277111,
                            author: {
                                name: data.word
                            },
                            fields: fields.length ? fields : [{ name: "Definition", value: "No definitions found." }]
                        }]
                    });
                })
                .catch(error => {
                    const errMsg = error?.response?.data?.message || 'Unable to find that word.';
                    reject(errMsg);
                });
        });
    }
};