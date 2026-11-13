# Personal-details check

Stops a commit, and a push, that contains a real-looking UK mobile number or an email address that is not on the allowed list.
It also stops a commit signed with a personal email address.

Turn it on once in each copy of the repository:

    git config core.hooksPath .githooks

What it does not cover: changes made on GitHub's own website. For those, tick "Keep my email addresses private" in
GitHub > Settings > Emails.

Test data is made up: mobiles 07700 900000 to 07700 900999, emails at example.com.
