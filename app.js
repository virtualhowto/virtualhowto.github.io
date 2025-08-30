$(document).ready(() => {
  $.getJSON('https://api.github.com/repos/virtualhowto/virtualhowto.github.io/contents/?ref=gh-pages', function(data) { // Replace with your username and repository name 
    const htmlFiles = data.filter((file) => file.name.endsWith('.html'));
    htmlFiles.forEach((file) => {
      $('#fileList').append('<li><a href="' + file.download_url + '" target="_blank">' + file.name + '</a></li>'); // Adds an HTML link for each HTML file to the list
    });
  })
});
