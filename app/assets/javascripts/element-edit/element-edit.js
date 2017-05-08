jQuery(document).ready(function(){
  jQuery('[data-element-block]').each(function(){
    var dataElementBlock = jQuery(this).closest('[data-element-block]')
    var element = dataElementBlock.attr('data-element-block') 
    jQuery(this).prepend('<a href="/admin/element/' + element + '" target="_blank"><span class="element-edit">✎</span></a>')
    jQuery('.element-edit', this)
      .on('mouseover', function(){
        dataElementBlock.addClass('hover')
      })
      .on('mouseout', function(){
        dataElementBlock.removeClass('hover')
      })
      .on('click', function(e){
        e.stopPropagation()
        e.preventDefault()
        var $link = jQuery(this).closest('a')
        window.open($link.attr('href'), $link.attr('target'));
      })
  })
})