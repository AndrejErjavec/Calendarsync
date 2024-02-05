const urlString = "https://example.com/page?param1=value1&param2=value2";

const url = new URL(urlString)

// Create a URLSearchParams object from the URL string
const urlParams = new URLSearchParams(url.search);

// Get individual parameter values
const param1Value = urlParams.get("param1");
const param2Value = urlParams.get("param2");

console.log(param1Value); // Output: value1
console.log(param2Value); // Output: value2
