# iris-i18n

IRIS - Site Localisation Module
-----

iris-i18n module is integrated within iris applications and provides tools for web site translation.  This module does not currently integrate with Transifex or any other translation services. It provides it's own translation backend, which function in real-time - any entry translated is immediately visible on the web site.

iris-i18n requires EJS rendering engine.

## Configuration

`your-app/config/` folder contains 3 files: 
* `i18n.conf` - configration settings
* `i18n.users` - configuration for user accounts
* `i18n.data` - data file containing all translation entries

`i18n.conf` mainly contains list of supported languages and is automatically saved each time options are changed in the translation backend (enabling/disabling active languages).

**TBD - include example file in the repo**

`i18n.users` should be created locally when your application is deployed.  It must not be present in git (unless your project is a private repository)

User configuration is done as follows:
```
{
	"<username>" : {
		"locales" : "en fr",	// or "*" for all  (controls access to specific languages)
		"pass" : "<sha256>"		// hex sha256 of pass
	}
}
```

User login to the i18n backend uses geometric back-off algorithm, which means that each time incorrect login is made, the amount of seconds user has to wait doubles.


`i18n.data` is a custom data format that is kept in git and lives together with your project.  The file format is custom in order to allow easier merging when encountering git merge conflicts.


## Translation Entries

Translation entries are generated using two phases.  During the first phase, iris-i18n module scans `html` and `ejs` files located in your project and extracts all visible entries.  Second phase is when translation entries are actually displayed on the web site.

All translation entries are kept in memory and when entries are translated, the database is delay-flushed to `i18n.data` file.

To check if any translation has been done, you can simply do `git diff` in your project to see if any modifications have been done to `i18n.data` file.

## Usage

`iris-i18n` provides a variable `_T` globally available within the EJS rendering context.  `_T` is a function and a variable container (object) at the same time.  Following variables are available under `_T`:

* `_T.locale` - current locale code
* `_T.languages` - list of active/enabled languages
* `_T.availableLanguages` - list of available languages (including languages that have not been activated/enabled)
* `_T.source` - source language of the site (typically "en")

To add a text entry to the translation database, user must pass it through a `_T()` function during EJS rendering phase (by embedding it into EJS view) as follows:

```
<!-- without support for HTML entities -->
<%= _T("Hello World") %>

<!-- with suppor for HTML entities -->
<%- _T("Hello World") %>
```

**NOTE:** Using EJS escaping for HTML entities `<%= %>` tag is recommended as non-escaping output tag `<%- %>` allows HTML injection into the web page.  However, in some cases, especially when it comes to RTL languages and text envelopping links, it is desirable to re-position text around the link.  In this case, unescaped text is fine. Just make sure to review translated entries or make sure you trust people who are translating your content.

For security sensitive sites and applications, you can deploy your NodeJs server in an alternate location (or on an alternate port), have people do the translation and then validate it by reviewing `i18n.data` file.  Once done, commit the changes and pull them on the primary server.

Note on escaping - when allowing for unescaped HTML entities, you must make sure that HTML entities in the original HTML are preserved, as otherwise this may break your HTML content. (i.e. `<a href="abc">` is preserved in original form - ommission of quotes will produce HTML with invalid syntax)

**IMPORTANT:** When pulling `i18n.data` changes from git, you must restart your process, preferably stop, pull and start.  If site content is actively being translated, there is a risk of the running process to overwrite `i18n.data` file if someone translates an entry after the updated file has been pulled.  We may change this behavior in the future.

If you have text located in client-side JS objects, best way to handle this is to relocate these objects into the EJS space, transform them via the `_T()` function and re-publish them back to client JS objects.  Example:

```
<% 
	var obj = [
		{ title : "first" },
		{ title : "second"}
	];

	_.each(obj, function(o) {
		o.title = _T(o.title);
	})
%>

<script>
	var obj = <%= JSON.stringify(obj) %>
</script>

```

## Translation backend

Translation backend can be accessed via `/i18n/` path in your iris application.  (for example: `http://your-site.com/i18n/`)

Description of the user interface is available here: https://github.com/aspectron/iris-i18n/blob/master/doc/iris-i18n-user-interface.pdf
