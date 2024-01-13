const myNumber = 42

console.log(localStorage.getItem('number', myNumber.toString()));
localStorage.setItem('number', myNumber);
console.log(localStorage.getItem('number', myNumber.toString()));