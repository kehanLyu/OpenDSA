// Set server_url = "" in order to disable server communication and most logging
var server_url = "http://128.173.55.223:8080"; // opendsa.cc.vt.edu:8080
// Dan's desktop: 128.173.54.186:8000
// Eric's desktop: 128.173.55.223:8080

// Contains a list of all AVs on the page
var avList = [];

$(document).ready(function() {
  //Make sure localStorage is enabled
  var localStorageEnabled = function() {
    var enabled, uid = +new Date;
    try {
      localStorage[ uid ] = uid;
      enabled = ( localStorage[ uid ] == uid );
      localStorage.removeItem( uid );
      return enabled;
    }
    catch( e ) {
      return false;
    }
  }();

  if ( !localStorageEnabled ) {
    if ( typeof jQuery !== "undefined" ) {
      warn( "You must enable DOM storage in your browser.", false );
    }
    return;
  }
  
  // Populate the list of AVs on the page
  // Add all AVs that have a showhide button
  $('.showHideLink').each(function(index, item){
    var av_name = $(item).attr('id').replace('_showhide_btn', '');
    
    avList.push(av_name);
  });
  
  // Add all AVs that have a proficiency check mark that are not already in the list
  $('img.prof_check_mark').each(function(index, item){
    var av_name = $(item).attr('id').replace("_check_mark", '');
    
    if (avList.indexOf(av_name) == -1) {
      avList.push(av_name);
    }
  });
  
  if (serverEnabled()) {
    // Send any stored event data when the page loads
    if (userLoggedIn()) {
      flush_stored_data();
    } else {
      send_event_data();
    }
  
    // TODO: Figure out a more robust way to determine if this is a module
    // Get the module or AV name as soon as possible
    if (isModulePage()) {
      var modName = getNameFromURL();
      // Save the module name in localStorage
      localStorage["module_name"] = modName;
      // Log the browser ready event
      log_user_action('', 'document-ready', 'User loaded the ' + modName + ' module page');
      
      // Suggest the user login if they don't have a valid session,
      // update the login link with their name if they do
      if (is_SessionExpired()){
        localStorage.removeItem("opendsa");
        if (!inLocalStorage("warn_login")) {
          showLoginBox();
        }
      } else {
        var uname = getUsername();
        $('a.login-window').text('Logout ' + uname);
      }
    } else {
      var av_name = getNameFromURL();
      // Log the browser ready event
      log_user_action(av_name, 'document-ready', 'User loaded the ' + av_name + ' AV');
    }
    
    // Add button_logger to all buttons on the page
    $(':button').each(function(index, item){
      // Don't attach handler to JSAV managed controls
      if (!isJSAVControl(item)) {
        $(item).click(button_logger);
      }
    });
    
    // Add link_logger to all links on the page
    $('a').each(function(index, item){
      // Don't attach handler to JSAV managed controls
      if (!isJSAVControl(item) && $(item).attr("id") !== "logon" && $(item).attr("class") !== "close") {
        $(item).click(link_logger);
      }
    });

    // Attempts to log the user in when they click submit on the login window
    $('button.submit-button').click(function(event){
      //authenticate user
      username = $('#username').attr('value');
      password = $('#password').attr('value');
      //password = SHA1(password);
      jQuery.ajax({
        url:   server_url + "/api/v1/users/login/",
        type:  "POST",
        data: {"username":  username , "password": password  },
        contentType: "application/json; charset=utf-8",
        datatype: "json",
        xhrFields: {withCredentials: true},
        success: function(data) {
          data = getJSON(data);
        
          if(data.success){
            updateLocalStorage(username );
            localStorage.name = username;
            $('a.login-window').text('Logout ' + username);
            log_user_action('', 'user-login', 'User logged in');
            hideLoginBox();
            
            // Submit any stored data
            flush_stored_data();
            update_all_proficiency_displays();
          }
        },
        error: function(data){ 
          data = getJSON(data);
          console.log("ERROR " +  JSON.stringify( data ));
          
          if (data.status == 401) {
            alert("Incorrect username / password combination");
          } else if (data.status == 0) {
            alert("Login failed because the server is not responding or is not reachable.\nFor help, please contact the OpenDSA team.");
            localStorage["warn_login"] = true;
            hideLoginBox();
          } else {
            alert("Login failed");
            localStorage["warn_login"] = true;
            hideLoginBox();
          }
        }
      });
    });

    // Brings up the login box if the user clicks 'Login' and
    // logs the user out if they click their username
    $('a.login-window').click(function() {
      var username = getUsername();
      if ($('a.login-window').text() === 'Login'){
        showLoginBox();
        return false;
      } else {
        // Submit whatever data we have collected before the user logs out
        flush_stored_data();
        jQuery.ajax({
          url:   server_url + "/api/v1/users/logout/",
          type:  "GET",
          data: {"username":  username },
          contentType: "application/json; charset=utf-8",
          datatype: "json",
          xhrFields: {withCredentials: true},
          success: function(data){
            data = getJSON(data)
          
            if(data.success){
              log_user_action('', 'user-logout', 'User logged out');
              localStorage.removeItem('warn_login');
              localStorage.removeItem('opendsa');
              $('a.login-window').text("Login");
              
              // Clear the proficiency displays for the user who just logged out
              update_all_proficiency_displays();
            }
          },
          error: function(data){ console.log("ERROR " +  JSON.stringify( data ));}
        });
      }
    });

    // When clicking on the button close or the mask layer the popup closed
    $('a.close, #mask').live('click', function() {
      // If the user tries to close the login box without logging 
      // in, warn them they will not receive credit without logging in
      warn_user_login();
      hideLoginBox();
    });
  }
  
  // Load proficiency data for current user
  update_all_proficiency_displays();

  $("input.showHideLink").click(function(event){
    var btnID = event.target.id;
    
    showHide(btnID);
  });

  $("a.abt").click(function(event){
    info();
  });
});

function showHide(btnID) {
  var divID = btnID.replace('_showhide_btn', '');
  
  var btnText = $('#' + btnID).attr('value');    // If $('#' + btnID) doesn't work use: $('input[id="' + btnID + '"]')
  
  if (document.getElementById(divID)) {
    if ($('#' + divID).css('display') !== "none") {
      // AV is visible, hide it
      $('#' + divID).css('display', 'none');
      // Update the button text
      $('#' + btnID).attr('value', btnText.replace('Hide', 'Show'));
      return;
    } else {
      // AV is hidden, show it
      $('#' + divID).css('display', 'block');
    }
  } else {
    // If the AV isn't loaded, load it
    var src = $('#' + btnID).attr("data-frame-src");
    var width = $('#' + btnID).attr("data-frame-width");
    var height = $('#' + btnID).attr("data-frame-height");
    
    $('#' + btnID).after('<div id="' + divID + '"><p></p><center> <iframe src="' + src + '" type="text/javascript" width="' + width + '" height="' + height + '" frameborder="0" marginwidth="0" marginheight="0" scrolling="no">\n </iframe></center></div>'); 
  }
  
  // Update the button text
  $('#' + btnID).attr('value', btnText.replace('Show', 'Hide'));
  
  // If the server is enabled and no user is logged in, warn them 
  // they will not receive credit for the exercise they are attempting 
  // to view without logging in
  if (serverEnabled() && !userLoggedIn()) {
    warn_user_login();
  }
}

function showLoginBox() {
  log_user_action('', 'login-box-open', 'Login box was opened');
  
  var loginBox = '#login-box';
  
  // Preload the last saved username in the login form
  var username = localStorage.name;
  if (username) {
    $('#username').attr('value', username);
  }

  //Fade in the Popup
  $(loginBox).fadeIn(300);

  //Set the center alignment padding + border see css style
  var popMargTop = ($(loginBox).height() + 24) / 2;
  var popMargLeft = ($(loginBox).width() + 24) / 2;

  $(loginBox).css({
    'margin-top' : -popMargTop,
    'margin-left' : -popMargLeft
  });

  // Add the mask to body
  $('body').append('<div id="mask"></div>');
  $('#mask').fadeIn(300);
}

function hideLoginBox() {
  log_user_action('', 'login-box-close', 'Login box was closed');
  
  $('#mask , .login-popup').fadeOut(300 , function() {
    $('#mask').remove();
  });
  return false;
}

function info() { // This is what we pop up
  var loc = window.location.pathname.substring(window.location.pathname.lastIndexOf('/')+1);
  if (loc==""){
    loc="index.html";
  }
  var mod = loc.split('.');
  outcome = -1 
  $.ajax({
    url: 'modules.json',
    async: false,
    dataType: 'json',
    success: function (data) {
      $.each(data, function(key, val) {
        if(val.fields.short_display_name.toLowerCase()==mod[0].toLowerCase()){
          var mystring = mod[0] +"\nWritten by "+val.fields.author +" \nCreated as part of the OpenDSA hypertextbook project.\nFor more information, see http://algoviz.org/OpenDSA\nFile created: "+val.fields.last_modified +"\nJSAV library version " + JSAV.version();
          outcome = 1  
          alert(mystring);
        }
      });
    }
  });
  
  if (outcome == -1) {  
    var mystring = mod[0] +" \nCreated as part of the OpenDSA hypertextbook project.\nFor more information, see http://algoviz.org/OpenDSA\nJSAV library version " + JSAV.version();
    alert(mystring);  
  } 
}

function updateLocalStorage(username ) {
  var myDate=new Date();
  myDate.setDate(myDate.getDate()+5);  //the session is valid 5 days
  var strSession = '{"username" :"'+ username + '", "expires" :"'+ myDate + '"}';
  localStorage["opendsa"] = strSession;
}

function is_SessionExpired() {
  if (inLocalStorage("opendsa")) {
    var  bj = JSON.parse( localStorage["opendsa"]);
    sDate = bj.expires;
    var cDate=new Date();
    return sDate <= cDate;
  }
  return true;
}

function getUsername() {
  if (inLocalStorage("opendsa")) {
    var obj = JSON.parse(localStorage["opendsa"]);
    return obj.username;
  }
  return "";
}

// Determine if the backend metrics collection server is enabled
function serverEnabled() {
  return (server_url !== "");
}

/**
 * Returns whether or not a user is currently logged in
 */
function userLoggedIn() {
  return (getUsername() !== "");
}

/**
 * Returns true if the page contains a hyperlink with id='logon' in a div with class="header"
 *   context - optional parameter to specify another document 
 *            (such as the window.parent.document of a page loaded in an iFrame)
 */
function isModulePage(context) {
  // Context will default to document if not provided
  context = (context) ? context : document;
  
  // TODO: Is this really a good way to do this?
  if ($('a#logon', context).length == 1 && $('a#logon', context)[0].parentElement.tagName == "DIV" && $('a#logon', context)[0].parentElement.className.match(/[.*\s]?header[.*\s]?/)) {
    return true;
  }
  return false;
}

/**
 * Returns true if the given document has '/AV/' in the URL
 *   context - optional parameter to specify another document 
 *            (such as getting the document loaded in an iFrame on a module page)
 */
function isAVPage(context) {
  // Context will default to document if not provided
  context = (context) ? context : document;
  
  // TODO: Is this really a good way to do this?
  return context.location.href.indexOf('/AV/') > -1;
}

/**
 * Returns the module name (read from localStorage), returns "" if 
 * 'module_name' doesn't exist in localStorage
 */
function getModuleName() {
  return (inLocalStorage("module_name") ? localStorage.module_name : "");
}

/**
 * Returns the name of the AV or exercise if called from an AV page, returns "" otherwise
 */
function getAVName() {
  return (isAVPage() ? getNameFromURL() : "");
}

/**
 * Parses the name of the page from the URL
 */
function getNameFromURL(url)
{
  // If no URL is specified, uses the pathname of the current page
  url = (url) ? url : location.pathname;
  var start = url.lastIndexOf("/") + 1;
  var end = url.lastIndexOf(".htm");
  return url.slice(start, end);
}

/**
 * Returns true if the given element is a JSAV managed control
 * Relies on JSAV controls being in a container with a class that matches '.*jsav\w*control.*'
 * include "jsavexercisecontrols" and "jsavcontrols"
 */
function isJSAVControl(item) {
  return (item && item.parentElement && item.parentElement.className.match(/.*jsav\w*control.*/));
  //return (item !== "undefined" && item.parentElement !== "undefined" && item.parentElement.className.match(/.*jsav\w*control.*/) !== null);
}

function inLocalStorage(varName) {
  return localStorage[varName];
}

// Returns the given data as a JSON object
// If given a string, converts it to JSON
// If given a JSON object, does nothing
function getJSON(data) {
  if (typeof data === "string") {
    data = jQuery.parseJSON( data );
  }

  if (data == null) {
    console.log("Error parsing JSON data: " + JSON.stringify(data));
  }

  return data;
}

//*****************************************************************************
//*************       Proficiency Check and Display Update        *************
//*****************************************************************************

/**
 * Check the proficiency of all AVs on the page 
 */
function update_all_proficiency_displays(){
  for (i in avList) {
    checkProficiency(avList[i]);
  }
}

/**
 * Given an AV name, checks localStorage to see if we have a 
 * record of the current user being proficient.  If no entry 
 * is found in localStorage, the backend server is enabled and 
 * a user is logged in, queries the server to obtain user's 
 * proficiency status
 */
function checkProficiency(av_name) {
  console.log("checkProficiency of " + av_name + " for " + username); //TODO: FOR TESTING
  
  var username = getUsername();
  var profStatus = checkProfLocalStorage(av_name);

  // Clear the proficiency display if the current user is not listed as proficient
  updateProfDispStat(av_name, profStatus);
  
  if (profStatus) {
    return;
  }
  
  console.log("checkProficiency: " + av_name + " not found in localStorage for user: " + username); //TODO: FOR TESTING
  
  // Check server for proficiency status
  if (serverEnabled() && userLoggedIn()) {
    console.log("checkProficiency: checking server for " + username + "'s proficiency"); //TODO: FOR TESTING

    jQuery.ajax({
      url:   server_url + "/api/v1/userdata/isproficient/",
      type:  "POST",
      data: {"username": username,"exercise": av_name },
      contentType: "application/json; charset=utf-8",
      datatype: "json",
      xhrFields: {withCredentials: true},
      success: function(data){
        data = getJSON(data);

        console.log("checkProficiency: server says: " + JSON.stringify(data)); //TODO: FOR TESTING
        
        // Proficiency indicators were cleared above, only need to 
        // update them again if server responded that the user is proficient
        if (data.proficient) {
          storeProficiencyStatus(av_name, true);
        }
      },
      error: function(data){ console.log("ERROR " + "isProficient" /*JSON.stringify( data )*/);}
    });
  }
}

/**
 * Given an AV name, returns whether localStorage has a  
 * record of the current user being proficient
 */
function checkProfLocalStorage(av_name) {
  var username = getUsername();

  console.log("checkProfLocalStorage of " + av_name + " for " + username); //TODO: FOR TESTING
  
  // Check for proficiency status in localStorage
  if (inLocalStorage("proficiency_data")) {
    var profData = getJSON(localStorage["proficiency_data"]);
    
    // Check whether user has an entry 
    if (profData[username]) {
      var av_list = profData[username];
      
      // Check to see if the AV exists in the user's proficiency list
      if (av_list.indexOf(av_name) > -1) {
        console.log("checkProficiency found " + av_name + " for user: " + username); //TODO: FOR TESTING
        return true;
      }
    }
  }
  
  return false;
}

/**
 * If status is true, saves the given AV name in localStorage, tied to the current user
 * If status is false, clears the proficiency indicator for the given AV
 * 
 * Should be called:
 *     - When the client determines a user is proficient if no user is logged in
 *     - if the server says the logged in user is proficient
 */
function storeProficiencyStatus(av_name, status) {
  console.log("storeProficiencyStatus(" + av_name + ", " + status + ")"); //TODO: FOR TESTING

  // Update the proficiency display for the specified AV
  updateProfDispStat(av_name, status);
  
  if (!status) {
    return;
  }
  
  var username = getUsername();
  var data = {};

  if (inLocalStorage("proficiency_data")) {
    data = getJSON(localStorage["proficiency_data"]);
    
    // Check whether user has an entry 
    if (data[username]) {
      var av_list = data[username];
      
      // Check to see if the AV already exists in the user's proficiency list
      if (av_list.indexOf(av_name) == -1) {
        av_list.push(av_name);
      }
    } else {
      // Add a new entry for the user
      data[username] = [av_name];
    }
  } else {
    // Check a new object to store proficiency data and add a new entry for the user
    data[username] = [av_name];
  }
  
  localStorage["proficiency_data"] = JSON.stringify(data);
}

/**
 * Update the proficiency indicator(s) for the specified AV
 */
function updateProfDispStat(av_name, status) {
  
  console.log("updateProfDispStat('" + av_name + "', " + status + ")");  //TODO: FOR TESTING
  
  var objId = av_name + '_check_mark';
  
  // Hide or display proficiency check mark, if it exists
  if ($('#' + objId).length > 0) {
    if (status) {
      // Display the proficiency check mark
      $("#" + objId).css('display', 'block');
    } else {
      // Hide the proficiency check mark
      $("#" + objId).css('display', 'none');
    }
  }
  
  objId = av_name + '_showhide_btn';
  console.log("updateProfDispStat: $('#' + objId).length = " + ($('#' + objId).length) + ", > 0: " + ($('#' + objId).length > 0) ); //TODO: FOR TESTING
  
  // Change AV showhide button to red or green to indicate proficiency, if it exists
  if ($('#' + objId).length > 0) {
    console.log("updateProfDispStat: button (" + objId + ") found" ); //TODO: FOR TESTING
    
    if (status) {
      // Turn the button green
      $("#" + objId).css("background-color", "lime");
    } else {
      // Turn the button red
      $("#" + objId).css("background-color", "#FF0000");
    }
  } else {
    console.log("updateProfDispStat: no button (" + objId + ") found" ); //TODO: FOR TESTING
  }
}

//*****************************************************************************
//***********        Scoring, Logging and Metrics Collection        ***********
//*****************************************************************************

if (serverEnabled()) {
  $(window).on('beforeunload', function() {
    // Log the browser unload event
    log_user_action('', 'window-unload', 'User closed or refreshed the page');

    // Remove the module name when they leave the module page
    if ( getModuleName() !== "" ) {
      localStorage.removeItem('module_name');
    }
  });

  // Listen for JSAV events
  $("body").on("jsav-log-event", function(e, data) { 
    console.log(data);    // TODO: FOR DEBUGGING
    
    var flush = false;
    
    var ssEvents = ['jsav-forward', 'jsav-backward', 'jsav-begin', 'jsav-end'];
    
    // TODO: Make sure all additional fields of JSAV events are logged somewhere
    if (ssEvents.indexOf(data.type) > -1) {
      data.desc = data.currentStep + " / " + data.totalSteps;
    } else if (data.type === "jsav-array-click") {
      data.desc = "User clicked element " + data.index + " of " + data.arrayid;
    } else if (data.type === "jsav-exercise-grade-change") {
      data.desc = JSON.stringify(data.score);
      
      // On grade change events, log the user's score and submit it
      store_av_score(data.av, "pe", data.score);
      flush = true;
    } else {
      data.desc = data.type;
    }

    // Save the event in localStorage
    log_event(data);
    
    if (data.type === "jsav-forward" && data.currentStep == data.totalSteps) {
      // TODO: If user is already proficient don't need to send grade data again?
      
      // When a user reaches the end of an AV, store and submit a completion score
      var score = {};
      score.student = data.currentStep;
      score.correct = data.currentStep;
      score.total = data.totalSteps;
      score.fix = 0;
      score.undo = 0;
      
      // Store and submit the score
      store_av_score(data.av, "ss", score);
      flush = true;
      
      if (!serverEnabled() || !userLoggedIn()) {
        // If no user is logged in (whether or not the server is 
        // enabled), allow the client to determine user proficiency
        storeProficiencyStatus(data.av, true);
      }
    }
    
    if (flush) {
      flush_stored_data();
    }
  });
}

/**
 * Logs the initial state of an array generated for an AV or exercise
 *     av_name - Name of the AV with which the array is associated
 *     js_array - Raw JavaScript array containing the initial data
 */
function log_exercise_init_array(av_name, js_array) {
  if (serverEnabled()) {
    log_user_action(av_name, 'exercise_initialization', '[' + js_array.toString() + ']');
  }
}

/**
 * Default function to handle logging button clicks
 */
function button_logger() {
  if (serverEnabled()) {
    var type = this.type + "-" + this.value;
    var av_name = getAVName();
    
    if (av_name === "" && this.form != null) {
      av_name = this.form.id;
    }
    
    var desc = "";
    
    // TODO: Find a better way to get the description for a button
    if (this.hasAttribute('data-desc')) {
      desc = this.getAttribute('data-desc');
    } else if (this.id !== "") {
      desc = this.id;
    } else if (this.name !== "") {
      desc = this.name;
    }
    
    log_user_action(av_name, type, desc);
  }
}

/**
 * Default function to handle logging hyperlink clicks
 */
function link_logger() {
  if (serverEnabled()) {
    // TODO: Find a better way to log links
    log_user_action('', 'hyperlink', $(this).html() + "(" + this.href + ")");
  }
}

/**
 * Logs a custom user interaction
 *     av_name - Name of the AV with which the action is associated
 *     type - String identifying the type of action
 *     desc - Human-readable string describing the action
 */
function log_user_action(av_name, type, desc) {
  if (serverEnabled()) {
    
    var json_data = {};
    json_data.av = av_name;
    json_data.type = type;
    json_data.desc = desc;
    log_event(json_data);
  }
}

/**
 * Appends the given data to the event log
 *     data - A JSON string or object containing event data, must contain the following fields: 'av', 'type', 'desc'
 */
function log_event(data) {
  if (serverEnabled()) {
    data = getJSON(data);
    
    // Ensure given JSON data is a valid event
    if (!isValidEvent(data)) {
      return;
    }

    console.log("av: " + data.av + ", type: " + data.type + ", desc: " + data.desc);    //TODO: FOR TESTING
    
    var modName = getModuleName();
    
    // Don't log events without either an AV name or a module name
    // Getting duplicates of some events where one is missing both
    // Currently all legitimate events should have one or the other
    if (data.av === "" && modName === "") {
      return;
    }
    
    data.module_name = modName;
    
    // Add a timestamp to the data
    if (data.tstamp) {
      // Convert existing JSAV timestamp from ISO format to milliseconds
      data.tstamp = new Date(data.tstamp).getTime();
    } else {
      data.tstamp = (new Date()).getTime();
    }
    
    var actions_list = new Array();

    // Retrieve existing data from localStorage if it exists
    if (inLocalStorage("event_data")) {
      actions_list = getJSON(localStorage["event_data"]);
    }

    actions_list.push(data);

    localStorage["event_data"] = JSON.stringify(actions_list);
  }
}

/**
 * Checks the given JSON object to ensure it has the correct fields
 *     data - a JSON object representing an event
 */
function isValidEvent(data) {
  var missingFields = [];
  
  if (typeof data.av === "undefined") {
    missingFields.push('av');
  }
  if (typeof data.type === "undefined") {
    missingFields.push('type');
  }
  if (typeof data.desc === "undefined") {
    missingFields.push('desc');
  }
  
  if (missingFields.length == 1) {
    console.log("ERROR: invalid event, '" + missingFields[0] + "' is undefined");
    return false;
  } else if (missingFields.length > 1) {
    var fields = missingFields.toString().replace(",", "', '");
    console.log("ERROR: invalid event, '" + fields + "' are undefined");
    return false;
  }
  
  return true;
}

// Stores the user's score for an AV / exercise
function store_av_score(av_name, type, score) {
  if (serverEnabled()) {
    var score_data = {};
    
    // Get stored score_data if it exists
    if ( inLocalStorage("score_data") ) {
      score_data = getJSON(localStorage["score_data"]);
    }
    
    // Store data if no data for the current AV is already stored or
    // update the score data if the given score data is >= what is stored
    if (!score_data[av_name] || score.correct >= score_data[av_name].score.correct) {
      var data = {};
      data.submit_time = (new Date).getTime();
      data.module_name = getModuleName();
      data.score = score;
      data.type = type;
      data.attempt = 0;    // TODO: Figure out how to record attempts
      data.total_time = 0;  // TODO: Figure out how to record total time
      score_data[av_name] = data;
      
      localStorage["score_data"] = JSON.stringify(score_data);
    }
  }
}

/**
 * Sends all stored event and AV score data to the server
 */
function flush_stored_data() {
  if (serverEnabled()) {
    send_event_data();
    send_av_scores();
  }
}

/**
 * Sends the event data logged in localStorage to the server
 */
function send_event_data() {
  if (serverEnabled()) {
    var event_list = getJSON(localStorage["event_data"]);

    // Return if there is no data to send
    if (!event_list || event_list.length == 0) {
      return true;
    }
    
    var username = getUsername();
    
    if (!userLoggedIn()) {
      username = "phantom";
    }

    var json_data = {};
    json_data.username = username;
    // Timestamp the submission so we can calculate offset from server time
    json_data.submit_time = (new Date()).getTime();
    json_data.actions = JSON.stringify(event_list);    // TODO: Find a better way to send this list so that Django can still interpret it
    
    // Send the data to the server
    jQuery.ajax({
      url:   server_url + "/api/v1/user/exercise/avbutton/",
      type:  "POST",
      data: json_data,
      contentType: "application/json; charset=utf-8",
      datatype: "json",
      xhrFields: {withCredentials: true},
      success: function(data) {
        data = getJSON(data);
        // Clear the saved data once it has been successfully transmitted
        if (data.success) {
          localStorage.removeItem('event_data');
        }
      },
      error: function(data) {
        console.log("ERROR " +  JSON.stringify( data ));
      }
    });
  }
}

//TODO: Should send these as a batch if possible, but Django doesn't seem to like that
/**
 * Loops through and sends all stored AV scores
 */
function send_av_scores() {
  if (serverEnabled()) {
    var score_data = {};
    
    // Get stored score_data if it exists
    if (inLocalStorage("score_data")) {
      score_data = getJSON(localStorage["score_data"]);
    }
    
    // Return if there is no score data
    if (score_data === {}) {
      return;
    }
    
    for (var av_name in score_data) {
      send_av_score(av_name);
    }
  }
}

/**
 * Sends a the score for a single AV
 */
function send_av_score(av_name) {
  if (serverEnabled()) {
    // Load stored score data from localStorage
    var score_data = {};
    if ( inLocalStorage("score_data") ) {
      score_data = getJSON(localStorage["score_data"]);
    }
    
    // Return if there is no score data
    if (score_data === {}) {
      return;
    }
      
    if (userLoggedIn()) {
      var username = getUsername();
    
      var json_data = score_data[av_name];
      json_data.av = av_name;
      json_data.username = username;
      
      jQuery.ajax({
        url:   server_url + "/api/v1/user/exercise/attemptpe/",
        type:  "POST",
        data: json_data,
        contentType: "application/json; charset=utf-8",
        datatype: "json",
        xhrFields: {withCredentials: true},
        success: function(data){
          data = getJSON(data);
          
          // Clear the saved data once it has been successfully transmitted
          if (data.success) {
            delete score_data[av_name];
            localStorage["score_data"] = JSON.stringify(score_data);
          }
          
          // Check whether the user is proficient
          if (data.proficient) {
            // Run it locally to store data and update displays on current page
            storeProficiencyStatus(av_name, true);
            
            // If this is running on an AV embeded in a module page, update display on module page
            if (isAVPage() && isModulePage(window.parent.document)) {
              window.parent.updateProfDispStat(av_name, true);
            }
          }
        },
        error: function(data) {
          //console.log("ERROR " +  JSON.stringify( data ));
        }
      });
    } else {
      // If a user performs an action that submits an AV score, 
      // but they are not logged in, warn them they will not 
      // receive credit without logging in
      warn_user_login();
    }
  }
}

/** 
 * Warn the user they will not receive credit unless they log in, 
 * but only:
 *   - If a login server is enabled
 *   - They are on a module page
 *   - They have not been prompted before
 */
function warn_user_login()
{
  /*
   * Only warn the user:
   *   - If the server is enabled
   */
  if (serverEnabled() && (!inLocalStorage("warn_login") || localStorage["warn_login"] !== "false") ) {
    // If triggered from a module page or an AV in an iFrame
    if (isModulePage() || (isAVPage() && isModulePage(window.parent.document))) {
      log_user_action('', 'login-warn-message', 'User warned they must login to receive credit');
      alert('You must be logged in to receive credit');
      localStorage["warn_login"] = "false";
    }
  }
}

/*
// TODO: Fix the Django server to accept batch scores
// Send a batch of AV scores
function send_av_scores() {
  if (serverEnabled()) {
    // Load stored score data from localStorage
    var score_data = {};
    if (inLocalStorage("score_data")) {
      score_data = getJSON(localStorage["score_data"]);
    }
    
    // Return if there is no score data
    if (score_data === {}) {
      return;
    }
      
    if (userLoggedIn()) {
      var username = getUsername();
    
      var json_data = {};
      json_data.username = username;
      // Timestamp the submission so we can calculate offset from server time
      json_data.submit_time = (new Date()).getTime();
      json_data.avs = score_data;
      
      jQuery.ajax({
        url:   server_url + "/api/v1/user/exercise/attemptpe/",
        type:  "POST",
        data: json_data,
        contentType: "application/json; charset=utf-8",
        datatype: "json",
        xhrFields: {withCredentials: true},
        success: function(data){
          data = getJSON(data);
          
          // Clear the saved data once it has been successfully transmitted
          if (data.success) {
            localStorage.removeItem('score_data');
          }
          
          // Check whether the user is proficient
          update_all_proficiency_displays();
        },
        error: function(data) {
          //console.log("ERROR " +  JSON.stringify( data ));
        }
      });
    } else {
      alert('You must be logged in to receive credit');
    }
  }
}


// Original attempt to log user actions to localStorage
function log_event_old(data) {

  if (typeof data === "string")
  {
    data = $.parseJSON(data);
  }

  if (inLocalStorage("event_data")) {
    var stored_data = $.parseJSON(localStorage["event_data"]);

    if (typeof stored_data === "undefined")
    {
      $.parseJSON(JSON.stringify(localStorage["event_data"]));
    }

    var tmp_data = stored_data.actions.push(data);
    
    localStorage["event_data"] = JSON.stringify(stored_data); // user_data.actions.push(data);
  } else {
    var json = {"username": getUsername(), "actions":[data]};
    localStorage["event_data"] = JSON.stringify(json);
  }
  
  //alert(localStorage["event_data"]);
  //alert("str: " + JSON.stringify(($.parseJSON(localStorage["event_data"])).actions[0]));
}
*/









/**
*
*  Secure Hash Algorithm (SHA1)
*  http://www.webtoolkit.info/
*
**/

function SHA1 (msg) {

  function rotate_left(n,s) {
    var t4 = ( n<<s ) | (n>>>(32-s));
    return t4;
  };

  function lsb_hex(val) {
    var str="";
    var i;
    var vh;
    var vl;

    for( i=0; i<=6; i+=2 ) {
      vh = (val>>>(i*4+4))&0x0f;
      vl = (val>>>(i*4))&0x0f;
      str += vh.toString(16) + vl.toString(16);
    }
    return str;
  };

  function cvt_hex(val) {
    var str="";
    var i;
    var v;

    for( i=7; i>=0; i-- ) {
      v = (val>>>(i*4))&0x0f;
      str += v.toString(16);
    }
    return str;
  };


  function Utf8Encode(string) {
    string = string.replace(/\r\n/g,"\n");
    var utftext = "";

    for (var n = 0; n < string.length; n++) {

      var c = string.charCodeAt(n);

      if (c < 128) {
        utftext += String.fromCharCode(c);
      }
      else if((c > 127) && (c < 2048)) {
        utftext += String.fromCharCode((c >> 6) | 192);
        utftext += String.fromCharCode((c & 63) | 128);
      }
      else {
        utftext += String.fromCharCode((c >> 12) | 224);
        utftext += String.fromCharCode(((c >> 6) & 63) | 128);
        utftext += String.fromCharCode((c & 63) | 128);
      }

    }

    return utftext;
  };

  var blockstart;
  var i, j;
  var W = new Array(80);
  var H0 = 0x67452301;
  var H1 = 0xEFCDAB89;
  var H2 = 0x98BADCFE;
  var H3 = 0x10325476;
  var H4 = 0xC3D2E1F0;
  var A, B, C, D, E;
  var temp;

  msg = Utf8Encode(msg);

  var msg_len = msg.length;

  var word_array = new Array();
  for( i=0; i<msg_len-3; i+=4 ) {
    j = msg.charCodeAt(i)<<24 | msg.charCodeAt(i+1)<<16 |
    msg.charCodeAt(i+2)<<8 | msg.charCodeAt(i+3);
    word_array.push( j );
  }

  switch( msg_len % 4 ) {
    case 0:
      i = 0x080000000;
    break;
    case 1:
      i = msg.charCodeAt(msg_len-1)<<24 | 0x0800000;
    break;

    case 2:
      i = msg.charCodeAt(msg_len-2)<<24 | msg.charCodeAt(msg_len-1)<<16 | 0x08000;
    break;

    case 3:
      i = msg.charCodeAt(msg_len-3)<<24 | msg.charCodeAt(msg_len-2)<<16 | msg.charCodeAt(msg_len-1)<<8  | 0x80;
    break;
  }

  word_array.push( i );

  while( (word_array.length % 16) != 14 ) word_array.push( 0 );

  word_array.push( msg_len>>>29 );
  word_array.push( (msg_len<<3)&0x0ffffffff );


  for ( blockstart=0; blockstart<word_array.length; blockstart+=16 ) {

    for( i=0; i<16; i++ ) W[i] = word_array[blockstart+i];
    for( i=16; i<=79; i++ ) W[i] = rotate_left(W[i-3] ^ W[i-8] ^ W[i-14] ^ W[i-16], 1);

    A = H0;
    B = H1;
    C = H2;
    D = H3;
    E = H4;

    for( i= 0; i<=19; i++ ) {
      temp = (rotate_left(A,5) + ((B&C) | (~B&D)) + E + W[i] + 0x5A827999) & 0x0ffffffff;
      E = D;
      D = C;
      C = rotate_left(B,30);
      B = A;
      A = temp;
    }

    for( i=20; i<=39; i++ ) {
      temp = (rotate_left(A,5) + (B ^ C ^ D) + E + W[i] + 0x6ED9EBA1) & 0x0ffffffff;
      E = D;
      D = C;
      C = rotate_left(B,30);
      B = A;
      A = temp;
    }

    for( i=40; i<=59; i++ ) {
      temp = (rotate_left(A,5) + ((B&C) | (B&D) | (C&D)) + E + W[i] + 0x8F1BBCDC) & 0x0ffffffff;
      E = D;
      D = C;
      C = rotate_left(B,30);
      B = A;
      A = temp;
    }

    for( i=60; i<=79; i++ ) {
      temp = (rotate_left(A,5) + (B ^ C ^ D) + E + W[i] + 0xCA62C1D6) & 0x0ffffffff;
      E = D;
      D = C;
      C = rotate_left(B,30);
      B = A;
      A = temp;
    }

    H0 = (H0 + A) & 0x0ffffffff;
    H1 = (H1 + B) & 0x0ffffffff;
    H2 = (H2 + C) & 0x0ffffffff;
    H3 = (H3 + D) & 0x0ffffffff;
    H4 = (H4 + E) & 0x0ffffffff;

  }

  var temp = cvt_hex(H0) + cvt_hex(H1) + cvt_hex(H2) + cvt_hex(H3) + cvt_hex(H4);

  return temp.toLowerCase();
}
