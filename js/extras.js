async function loadAppletScripts() {
  // list the files you know exist
  const files = [
    "js/applets/hello-script.js",
    "js/applets/blower.js",
    "js/applets/apiExt.js",
  ];

  // fetch them all
  const fetchPromises = files.map(async path => {
    const res = await fetch(path);
    const text = await res.text();
    return `//===== ${path.split('/').pop()} =====\n\n${text}`;
  });

  // wait for all
  const contents = await Promise.all(fetchPromises);

  return contents; // array of strings
}

// Example usage
// loadAppletScripts().then(allScripts => {
//   console.log(allScripts.join("\n\n"));
// });

let jsLets


// Example usage:
loadAppletScripts().then(allScripts => {
  // console.log(allScripts);
  jsLets = allScripts.join('\n\n')
});
