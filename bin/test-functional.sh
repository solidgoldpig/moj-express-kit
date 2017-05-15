#!/usr/bin/env sh

CONFPATH=$PWD/codecept.conf.js

SCRIPTPATH=$0

SYMLINKPATH=$(ls -l $SCRIPTPATH | awk '{print $11}')
if [ "$SYMLINKPATH" != "" ]
  then
  SCRIPTPATH=$SYMLINKPATH
fi

SCRIPTPATH=$(dirname $SCRIPTPATH)

echo "Copying config file to: $CONFPATH"
cp $SCRIPTPATH/codecept.conf.js $CONFPATH

node_modules/codeceptjs/bin/codecept.js run --steps

if [ $? != 0 ]
  then
  FAILED=true
fi

echo "Removing config file: $CONFPATH"
rm $CONFPATH

if [ "$FAILED" == "true" ]
  then
  exit 1
fi
