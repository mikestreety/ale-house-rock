#!/bin/bash
for i in {1..598}
do
   # mv $i $(($i-1))

   # j=$(($i-1))
   # filename=$(ls beer/$i-*)
   # new_filename=${filename/"$i-"/"$j-"}
   # mv $filename $new_filename
   # sed "s/number: $i/number: $j/g" $new_filename > $new_filename.tmp
   # sed "s/-$i\//\//g" $new_filename.tmp > $new_filename
   # rm $new_filename.tmp
   # echo "$new_filename"

   filename=$(ls beer/$i-*)
   sed "s/-$i\//\//g" $filename > $filename.tmp
   rm $filename
   mv $filename.tmp $filename
   echo "$new_filename"
done
