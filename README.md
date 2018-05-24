# webpack-module-rules-utils

/!\ Have not been thoroughly tested yet, use with caution

-----------------

This is a set of utility methods for traversing and manipulating `module.rules` 
part of Webpack configuration.

Supposed to be useful to people using [react-app-rewired]

**Warning:** this module will implicitly change the rules array you pass to it. 
It should not be an end of the world - after all if you decide to use it you 
are likely going to modify said configuration anyway. And normalized configuration
is probably something you will benefit from because it's easier to work with.  
Just keep in mind that it happens implicitly. Also exported as a method.

[react-app-rewired]: https://github.com/timarney/react-app-rewired
